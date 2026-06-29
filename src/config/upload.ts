import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { env } from './env';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

// Resolve upload directory relative to the project root and ensure it exists.
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

// Only PDF and DOCX are supported.
// Note: application/msword (.doc) is intentionally excluded — the document
// parser only handles OOXML (.docx) and PDF, not the legacy .doc binary format.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  logger.warn(
    {
      originalName: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname,
    },
    'File upload rejected: unsupported MIME type',
  );

  cb(
    new ValidationError(
      `Only PDF (.pdf) and DOCX (.docx) files are supported. ` +
        `Received: "${file.mimetype}" (${file.originalname}).`,
    ),
  );
};

const multerInstance = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter,
});

export const uploadResumeFile = multerInstance.single('file');

// ─── Magic-byte validation ────────────────────────────────────────────────────
// Checks the actual file content, not the client-supplied MIME type, which is
// trivially spoofable. Called after multer saves the file so the raw bytes are
// available. Deletes the temp file and throws on mismatch.
//
// Signatures:
//   PDF  — %PDF  [0x25, 0x50, 0x44, 0x46]
//   DOCX — PK\x03\x04 [0x50, 0x4B, 0x03, 0x04] (ZIP local-file header)
const PDF_MAGIC  = [0x25, 0x50, 0x44, 0x46] as const;
const DOCX_MAGIC = [0x50, 0x4B, 0x03, 0x04] as const;

function matchesMagic(buf: Buffer, magic: readonly number[]): boolean {
  return magic.every((byte, i) => buf[i] === byte);
}

export async function assertValidFileMagicBytes(file: Express.Multer.File): Promise<void> {
  let header: Buffer;

  if (file.buffer) {
    // memoryStorage path (e.g. /parse endpoint)
    header = file.buffer.subarray(0, 4);
  } else {
    // diskStorage path (e.g. /upload endpoint)
    header = Buffer.alloc(4);
    const fd = await fs.promises.open(file.path, 'r');
    try {
      await fd.read(header, 0, 4, 0);
    } finally {
      await fd.close();
    }
  }

  const valid = matchesMagic(header, PDF_MAGIC) || matchesMagic(header, DOCX_MAGIC);
  if (!valid) {
    // Remove the already-saved file to avoid orphaned uploads on disk
    if (!file.buffer && file.path) {
      await fs.promises.unlink(file.path).catch(() => {});
    }
    throw new ValidationError(
      'File content does not match a supported format. Only genuine PDF and DOCX files are accepted.',
    );
  }
}
