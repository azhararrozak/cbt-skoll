import type { Request, Response } from 'express';
import { examService } from './exam.service';
import { sendSuccess } from '../../utils/response';
import {
  idParamSchema,
  listExamsSchema,
  startExamSchema,
  type CreateExamInput,
  type ListExamsInput,
  type StartExamInput,
  type UpdateExamInput,
} from './exam.schema';

export const listExams = async (req: Request, res: Response): Promise<void> => {
  const params = listExamsSchema.parse(req.query) as ListExamsInput;
  const { rows, totalItems } = await examService.list(params, req.user!);

  sendSuccess(res, {
    message: 'Daftar ujian',
    data: rows,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
    },
  });
};

export const getExam = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const exam = await examService.getById(id, req.user!);

  sendSuccess(res, { message: 'Detail ujian', data: exam });
};

export const createExam = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as CreateExamInput;
  const exam = await examService.create(input, req.user!);

  sendSuccess(res, { status: 201, message: 'Ujian berhasil dibuat', data: exam });
};

export const updateExam = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as UpdateExamInput;
  const exam = await examService.update(id, input, req.user!);

  sendSuccess(res, { message: 'Ujian berhasil diperbarui', data: exam });
};

export const deleteExam = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await examService.remove(id, req.user!);

  sendSuccess(res, { message: 'Ujian berhasil dihapus' });
};

export const regenerateToken = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const exam = await examService.regenerateToken(id, req.user!);

  sendSuccess(res, { message: 'Token ujian berhasil diperbarui', data: { token: exam.token } });
};

// Siswa: daftar ujian yang tersedia untuk kelasnya
export const listAvailableExams = async (req: Request, res: Response): Promise<void> => {
  const data = await examService.listAvailable(req.user!.id);

  sendSuccess(res, { message: 'Daftar ujian tersedia', data });
};

// Siswa: mulai / lanjutkan ujian dengan token
export const startExam = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = startExamSchema.parse(req.body) as StartExamInput;
  const result = await examService.start(id, input, req.user!.id);

  sendSuccess(res, {
    status: result.resumed ? 200 : 201,
    message: result.resumed
      ? 'Melanjutkan sesi ujian yang sedang berjalan'
      : 'Ujian dimulai, kerjakan sebelum waktu habis',
    data: {
      sessionId: result.session.id,
      status: result.session.status,
      startedAt: result.session.startedAt,
      expiresAt: result.session.expiresAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((result.session.expiresAt.getTime() - Date.now()) / 1000),
      ),
      totalQuestions: result.totalQuestions,
      resumed: result.resumed,
    },
  });
};

// Guru/admin: rekap hasil ujian
export const getExamResults = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const result = await examService.results(id, req.user!);

  sendSuccess(res, { message: 'Hasil ujian', data: result });
};
