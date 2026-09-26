import { z } from 'zod';

const tokenRegex = /^[A-Z0-9]{4,10}$/;

const examBaseSchema = z.object({
  title: z.string().trim().min(2, 'judul ujian minimal 2 karakter').max(200),
  description: z.string().trim().max(1000).optional(),
  bankId: z.coerce.number().int().positive('bankId harus berupa angka positif'),
  // Ujian bisa ditugaskan ke beberapa kelas sekaligus
  classIds: z
    .array(z.coerce.number().int().positive('classId harus angka positif'))
    .min(1, 'Pilih minimal satu kelas')
    .max(50, 'Maksimal 50 kelas'),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(1, 'durasi minimal 1 menit')
    .max(600, 'durasi maksimal 600 menit'),
  // Siswa boleh menyelesaikan ujian setelah menit ke-N (0 = bebas kapan saja)
  minSubmitMinutes: z.coerce.number().int().min(0, 'minimal 0 menit').max(600).default(0),
  // Tampilkan nilai ke siswa setelah selesai?
  showScore: z.boolean().default(true),
  // Acak urutan soal untuk tiap siswa?
  shuffleQuestions: z.boolean().default(false),
  token: z
    .string()
    .trim()
    .toUpperCase()
    .regex(tokenRegex, 'Token harus 4-10 karakter huruf/angka tanpa spasi')
    .optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  isPublished: z.boolean().default(false),
});

export const createExamSchema = examBaseSchema
  .refine(
    (data) => !data.startAt || !data.endAt || data.endAt > data.startAt,
    { message: 'endAt harus setelah startAt', path: ['endAt'] },
  )
  .refine((data) => data.minSubmitMinutes < data.durationMinutes, {
    message: 'Waktu minimal submit harus lebih pendek dari durasi ujian',
    path: ['minSubmitMinutes'],
  });

export const updateExamSchema = examBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diisi',
  })
  .refine((data) => !data.startAt || !data.endAt || data.endAt > data.startAt, {
    message: 'endAt harus setelah startAt',
    path: ['endAt'],
  });

export const startExamSchema = z.object({
  token: z
    .string({ message: 'Token wajib diisi' })
    .trim()
    .toUpperCase()
    .min(1, 'Token wajib diisi')
    .max(10, 'Token maksimal 10 karakter'),
});

export const listExamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type StartExamInput = z.infer<typeof startExamSchema>;
export type ListExamsInput = z.infer<typeof listExamsSchema>;
