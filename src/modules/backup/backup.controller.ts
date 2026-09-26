import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { getUploadedBuffer } from '../../middleware/upload.middleware';
import { exportBackup, restoreBackup } from './backup.service';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export const downloadBackup = async (_req: Request, res: Response): Promise<void> => {
  const backup = await exportBackup();
  const now = new Date();
  const filename = `backup-cbt-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backup, null, 2));
};

export const restoreFromBackup = async (req: Request, res: Response): Promise<void> => {
  const buffer = getUploadedBuffer(req);
  const restored = await restoreBackup(buffer);
  sendSuccess(res, {
    message: 'Data berhasil dipulihkan dari file backup',
    data: restored,
  });
};
