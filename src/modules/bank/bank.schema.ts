import { z } from 'zod';

export const createBankSchema = z.object({
  name: z.string().trim().min(2, 'nama bank soal minimal 2 karakter').max(150),
  subject: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const updateBankSchema = z
  .object({
    name: z.string().trim().min(2, 'nama bank soal minimal 2 karakter').max(150).optional(),
    subject: z.string().trim().max(100).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field (name/subject/description) harus diisi',
  });

export const listBanksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
});

const questionBaseFields = {
  questionText: z.string().trim().min(1, 'teks soal wajib diisi').max(2000),
  points: z.coerce.number().int().min(1, 'poin minimal 1').max(100, 'poin maksimal 100').default(1),
};

// 0 = Benar, 1 = Salah (mengikuti urutan opsi ["Benar", "Salah"])
export const trueFalseOptions = ['Benar', 'Salah'];

export const createQuestionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('multiple_choice'),
      ...questionBaseFields,
      options: z
        .array(z.string().trim().min(1, 'opsi tidak boleh kosong').max(500))
        .min(2, 'minimal 2 opsi jawaban')
        .max(5, 'maksimal 5 opsi jawaban'),
      correctAnswer: z.coerce.number().int().min(0, 'index kunci jawaban tidak valid'),
    })
    .refine((data) => data.correctAnswer < data.options.length, {
      message: 'Kunci jawaban melebihi jumlah opsi yang tersedia',
      path: ['correctAnswer'],
    }),
  z.object({
    type: z.literal('true_false'),
    ...questionBaseFields,
    correctAnswer: z.coerce.number().int().min(0).max(1, 'kunci jawaban hanya 0 (Benar) atau 1 (Salah)'),
  }),
  z.object({
    type: z.literal('short_answer'),
    ...questionBaseFields,
    correctAnswer: z.string().trim().min(1, 'kunci jawaban wajib diisi').max(500),
  }),
]);

export const updateQuestionSchema = createQuestionSchema;

export const questionParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
  questionId: z.coerce.number().int().positive('questionId harus berupa angka positif'),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export type CreateBankInput = z.infer<typeof createBankSchema>;
export type UpdateBankInput = z.infer<typeof updateBankSchema>;
export type ListBanksInput = z.infer<typeof listBanksSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
