import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ApiError } from '../utils/apiError';

const storage = multer.memoryStorage();

function makeUploader(extensions: string[], maxSizeMb: number): RequestHandler {
  const upload = multer({
    storage,
    limits: { fileSize: maxSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = extensions.some((ext) => file.originalname.toLowerCase().endsWith(ext));
      if (ok) {
        cb(null, true);
        return;
      }
      cb(ApiError.badRequest(`Format file harus ${extensions.join(' atau ')}`));
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? `Ukuran file maksimal ${maxSizeMb} MB`
            : 'Gagal mengunggah file';
        next(ApiError.badRequest(message));
        return;
      }
      next(error);
    });
  };
}

/** Upload file Excel (.xlsx) dengan field name "file" */
export const uploadExcel = makeUploader(['.xlsx'], 2);

/** Upload file Word (.docx) dengan field name "file" */
export const uploadDocx = makeUploader(['.docx'], 5);

/** Upload file JSON backup dengan field name "file" */
export const uploadJson = makeUploader(['.json'], 10);

/** Ambil buffer file yang sudah diupload */
export function getUploadedBuffer(req: Request): Buffer {
  if (!req.file?.buffer) {
    throw ApiError.badRequest('File tidak ditemukan');
  }
  return req.file.buffer;
}
