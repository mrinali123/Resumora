import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// ─── File Storage Abstraction ─────────────────────────────────────────────────
//
// Phase 2: local disk storage.
// Phase 3: swap the implementations below for AWS SDK / GCS SDK calls.
//          The rest of the codebase depends only on these three functions,
//          so the swap is fully contained to this file.

// Converts a relative storage path (as stored in the DB) to an absolute path.
// Keeping relative paths in the DB means the app can move between machines or
// containers without a data migration.
export function resolveStoragePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.resolve(process.cwd(), storagePath);
}

// Reads a stored file into a Buffer.
// Used by the extraction pipeline to feed bytes to pdf-parse / mammoth.
export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const absPath = resolveStoragePath(storagePath);
  return fs.promises.readFile(absPath);
}

// Deletes a stored file. Called when a Resume record is hard-deleted.
// Non-fatal: if the file is already gone we log a warning and move on,
// because the DB record deletion is the source of truth.
export async function deleteStoredFile(storagePath: string): Promise<void> {
  const absPath = resolveStoragePath(storagePath);

  // Guard against path traversal: only allow deletes inside the upload directory.
  // storagePath is written by multer (UUID filename) so this is a defence-in-depth
  // check in case a compromised DB row contains a crafted path.
  const absUploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  if (!absPath.startsWith(absUploadDir + path.sep)) {
    logger.error(
      { storagePath, absPath, absUploadDir },
      'Refusing to delete file outside upload directory — possible path traversal',
    );
    return;
  }

  try {
    await fs.promises.unlink(absPath);
    logger.info({ storagePath }, 'Deleted stored resume file');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.warn({ storagePath }, 'Resume file already gone — skipping delete');
      return;
    }
    throw err;
  }
}
