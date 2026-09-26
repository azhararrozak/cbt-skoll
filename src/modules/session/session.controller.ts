import type { Request, Response } from 'express';
import { sessionService } from './session.service';
import { sendSuccess } from '../../utils/response';
import {
  idParamSchema,
  listSessionsSchema,
  submitAnswerSchema,
  toggleFlagSchema,
} from './session.schema';
import type { AuthUser } from '../../middleware/auth.middleware';

export const listMySessions = async (req: Request, res: Response): Promise<void> => {
  const params = listSessionsSchema.parse(req.query);
  const { rows, totalItems } = await sessionService.listMine(req.user!.id, params);

  sendSuccess(res, {
    message: 'Riwayat sesi ujian',
    data: rows,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
    },
  });
};

export const getSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await sessionService.detail(id, req.user! as AuthUser);

  sendSuccess(res, { message: 'Detail sesi ujian', data });
};

export const submitAnswer = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = submitAnswerSchema.parse(req.body);
  const answer = await sessionService.submitAnswer(id, input, req.user!);

  sendSuccess(res, {
    message: 'Jawaban tersimpan',
    data: { questionId: answer.questionId, answer: answer.answer, answeredAt: answer.answeredAt },
  });
};

export const toggleFlag = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = toggleFlagSchema.parse(req.body);
  const flags = await sessionService.toggleFlag(id, input, req.user!);

  sendSuccess(res, { message: input.flagged ? 'Soal ditandai ragu-ragu' : 'Tanda ragu-ragu dihapus', data: { flags } });
};

export const forceFinishSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await sessionService.forceFinish(id, req.user!);
  sendSuccess(res, { message: 'Ujian siswa berhasil diselesaikan paksa', data });
};

export const resetSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await sessionService.reset(id, req.user!);
  sendSuccess(res, {
    message: 'Sesi ujian berhasil direset — siswa dapat memulai ulang dengan token',
    data,
  });
};

export const finishSession = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await sessionService.finish(id, req.user!);

  sendSuccess(res, { message: 'Ujian selesai', data });
};

export const getSessionResult = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await sessionService.result(id, req.user! as AuthUser);

  sendSuccess(res, { message: 'Hasil ujian', data });
};
