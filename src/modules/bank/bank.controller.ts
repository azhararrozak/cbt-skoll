import type { Request, Response } from 'express';
import { bankService } from './bank.service';
import { sendSuccess } from '../../utils/response';
import {
  createQuestionSchema,
  idParamSchema,
  listBanksSchema,
  questionParamSchema,
  type CreateBankInput,
  type UpdateBankInput,
  type UpdateQuestionInput,
} from './bank.schema';

export const listBanks = async (req: Request, res: Response): Promise<void> => {
  const params = listBanksSchema.parse(req.query);
  const { rows, totalItems } = await bankService.list(params, req.user!);

  sendSuccess(res, {
    message: 'Daftar bank soal',
    data: rows,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
    },
  });
};

export const getBank = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const bank = await bankService.getById(id, req.user!);

  sendSuccess(res, { message: 'Detail bank soal', data: bank });
};

export const createBank = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as CreateBankInput;
  const bank = await bankService.create(input, req.user!);

  sendSuccess(res, { status: 201, message: 'Bank soal berhasil dibuat', data: bank });
};

export const updateBank = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as UpdateBankInput;
  const bank = await bankService.update(id, input, req.user!);

  sendSuccess(res, { message: 'Bank soal berhasil diperbarui', data: bank });
};

export const deleteBank = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await bankService.remove(id, req.user!);

  sendSuccess(res, { message: 'Bank soal berhasil dihapus' });
};

export const listQuestions = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const rows = await bankService.listQuestions(id, req.user!);

  sendSuccess(res, { message: 'Daftar soal', data: rows });
};

export const createQuestion = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = createQuestionSchema.parse(req.body);
  const question = await bankService.createQuestion(id, input, req.user!);

  sendSuccess(res, { status: 201, message: 'Soal berhasil dibuat', data: question });
};

export const updateQuestion = async (req: Request, res: Response): Promise<void> => {
  const { id, questionId } = questionParamSchema.parse(req.params);
  const input = req.body as UpdateQuestionInput;
  const question = await bankService.updateQuestion(id, questionId, input, req.user!);

  sendSuccess(res, { message: 'Soal berhasil diperbarui', data: question });
};

export const deleteQuestion = async (req: Request, res: Response): Promise<void> => {
  const { id, questionId } = questionParamSchema.parse(req.params);
  await bankService.removeQuestion(id, questionId, req.user!);

  sendSuccess(res, { message: 'Soal berhasil dihapus' });
};
