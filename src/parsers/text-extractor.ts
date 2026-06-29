import path from 'path';
import mammoth from 'mammoth';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { ExtractedContent } from './types';

// pdf-parse ships no separate @types package and uses a CommonJS export.
// Defining a minimal type inline avoids a fragile ambient declaration file.
type PdfParseResult = { text: string; numpages: number };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<PdfParseResult> = require('pdf-parse');

// Minimum characters required to consider a PDF searchable.
// PDFs with fewer characters are non-searchable (scanned/image-only) and are
// rejected with a clear user-facing message; no OCR fallback is attempted.
const MIN_TEXT_CHARS = 50;

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// ─── Magic byte validation ────────────────────────────────────────────────────
//
// The Multer fileFilter trusts the client-supplied Content-Type header.
// This function verifies the actual file bytes so a renamed .exe with
// Content-Type: application/pdf cannot bypass the MIME check.
function validateMagicBytes(buffer: Buffer, mimeType: string): void {
  // PDF: %PDF  (25 50 44 46)
  const isPdf =
    buffer[0] === 0x25 && buffer[1] === 0x50 &&
    buffer[2] === 0x44 && buffer[3] === 0x46;

  // DOCX: PK\x03\x04  (50 4B 03 04) — ZIP-based Office Open XML
  const isZip =
    buffer[0] === 0x50 && buffer[1] === 0x4B &&
    buffer[2] === 0x03 && buffer[3] === 0x04;

  if (mimeType === 'application/pdf' && !isPdf) {
    throw new ValidationError(
      'File content does not match the declared PDF type. ' +
        'Please upload a valid PDF file.',
    );
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
    !isZip
  ) {
    throw new ValidationError(
      'File content does not match the declared DOCX type. ' +
        'Please upload a valid DOCX file.',
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Entry point for text extraction. Dispatches to the correct extractor based
// on MIME type, with magic-byte verification to prevent MIME-spoofing.
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  originalFileName: string,
): Promise<ExtractedContent> {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(
      `Unsupported file type '${mimeType}'. Please upload a searchable PDF (.pdf) or Word document (.docx).`,
    );
  }

  if (buffer.length === 0) {
    throw new ValidationError('The uploaded file is empty.');
  }

  validateMagicBytes(buffer, mimeType);

  const ext = path.extname(originalFileName).toLowerCase();
  const isPdf = mimeType === 'application/pdf' || ext === '.pdf';

  logger.debug(
    { mimeType, ext, sizeBytes: buffer.length },
    'Starting text extraction',
  );

  try {
    return isPdf
      ? await extractFromPdf(buffer, originalFileName)
      : await extractFromDocx(buffer);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    logger.error({ err, mimeType, originalFileName }, 'Text extraction failed unexpectedly');
    throw new ValidationError(
      'Could not extract text from this file. ' +
        'It may be corrupted, password-protected, or in an unsupported format.',
    );
  }
}

// ─── Extractors ───────────────────────────────────────────────────────────────

async function extractFromPdf(buffer: Buffer, originalFileName: string): Promise<ExtractedContent> {
  const t0 = Date.now();

  let result: PdfParseResult;
  try {
    result = await pdfParse(buffer);
  } catch (pdfErr) {
    const msg = String((pdfErr as Error)?.message ?? '').toLowerCase();
    if (msg.includes('password') || msg.includes('encrypt')) {
      throw new ValidationError(
        'This PDF is password-protected. Please remove the password before uploading.',
      );
    }
    logger.warn({ err: pdfErr, originalFileName }, 'pdf-parse could not read this PDF');
    throw new ValidationError(
      'Could not read this PDF. It may be corrupted or use an unsupported format. ' +
        'Please export it again from your document editor and try again.',
    );
  }

  const nativeText = cleanText(result.text);
  const pageCount = result.numpages;

  logger.debug({
    originalFileName,
    textLength: nativeText.length,
    pageCount,
    durationMs: Date.now() - t0,
  }, 'PDF text layer extraction result');

  // Non-searchable PDF (scanned/image-only): reject with a clear, actionable
  // message. Resumora does not support OCR — searchable PDFs are the
  // industry-standard format for ATS submissions.
  if (nativeText.length < MIN_TEXT_CHARS) {
    throw new ValidationError(
      "We couldn't detect readable text in your resume.\n\n" +
        'Resumora supports searchable PDF and DOCX resumes.\n\n' +
        'Most employers and Applicant Tracking Systems (ATS) recommend submitting ' +
        'searchable PDFs because they are easier to process accurately.\n\n' +
        'Please export your resume directly from Microsoft Word, Google Docs, or ' +
        'another editor as a searchable PDF and upload it again.',
    );
  }

  logger.info({
    originalFileName,
    textLength: nativeText.length,
    wordCount: countWords(nativeText),
    pageCount,
    durationMs: Date.now() - t0,
  }, 'PDF extraction complete');

  return { text: nativeText, wordCount: countWords(nativeText), pageCount };
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractedContent> {
  const result = await mammoth.extractRawText({ buffer });
  const text = cleanText(result.value);

  if (!text) {
    throw new ValidationError('No extractable text found in the DOCX file.');
  }

  if (result.messages.length > 0) {
    logger.warn({ messages: result.messages }, 'DOCX extraction warnings');
  }

  // DOCX has no reliable page count without rendering — leave undefined.
  return { text, wordCount: countWords(text) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Collapses runs of 3+ blank lines into 2 and trims leading/trailing whitespace.
function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
