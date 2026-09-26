import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { getUploadedBuffer } from '../../middleware/upload.middleware';
import {
  bankQuestionsTemplate,
  classStudentsTemplate,
  classesTemplate,
  importBankQuestionsDocx,
  importClassStudents,
  importClasses,
  importUsers,
  usersTemplate,
} from './import.service';

function fileDisposition(res: Response, filename: string): void {
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export const importUsersExcel = async (req: Request, res: Response): Promise<void> => {
  const buffer = getUploadedBuffer(req);
  const summary = await importUsers(buffer, req.user!.id);
  sendSuccess(res, { status: 201, message: 'Import akun selesai', data: summary });
};

export const importClassesExcel = async (req: Request, res: Response): Promise<void> => {
  const buffer = getUploadedBuffer(req);
  const summary = await importClasses(buffer, req.user!.id);
  sendSuccess(res, { status: 201, message: 'Import kelas selesai', data: summary });
};

export const importClassStudentsExcel = async (req: Request, res: Response): Promise<void> => {
  const classId = Number(req.params.id);
  const buffer = getUploadedBuffer(req);
  const summary = await importClassStudents(classId, buffer);
  sendSuccess(res, { status: 201, message: 'Import siswa ke kelas selesai', data: summary });
};

export const downloadUsersTemplate = async (_req: Request, res: Response): Promise<void> => {
  const buffer = await usersTemplate();
  fileDisposition(res, 'template-import-users-cbt.xlsx');
  res.send(buffer);
};

export const downloadClassesTemplate = async (_req: Request, res: Response): Promise<void> => {
  const buffer = await classesTemplate();
  fileDisposition(res, 'template-import-kelas-cbt.xlsx');
  res.send(buffer);
};

export const downloadClassStudentsTemplate = async (_req: Request, res: Response): Promise<void> => {
  const buffer = await classStudentsTemplate();
  fileDisposition(res, 'template-import-siswa-kelas-cbt.xlsx');
  res.send(buffer);
};

export const importBankQuestionsDocxFile = async (req: Request, res: Response): Promise<void> => {
  const bankId = Number(req.params.id);
  const buffer = getUploadedBuffer(req);
  const summary = await importBankQuestionsDocx(bankId, buffer, req.user!);
  sendSuccess(res, { status: 201, message: 'Import soal selesai', data: summary });
};

export const downloadBankQuestionsTemplate = async (_req: Request, res: Response): Promise<void> => {
  const buffer = await bankQuestionsTemplate();
  res.setHeader('Content-Disposition', 'attachment; filename="template-import-soal-cbt.docx"');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.send(buffer);
};
