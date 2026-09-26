import { z } from 'zod';

export const submitAnswerSchema = z.object({
  questionId: z.coerce.number().int().positive('questionId harus berupa angka positif'),
  answer: z.coerce.string().trim().min(1, 'Jawaban wajib diisi').max(500),
});

export const toggleFlagSchema = z.object({
  questionId: z.coerce.number().int().positive('questionId harus berupa angka positif'),
  flagged: z.boolean(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export const listSessionsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type ToggleFlagInput = z.infer<typeof toggleFlagSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
