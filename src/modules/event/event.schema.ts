import { z } from 'zod';

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3, 'judul event minimal 3 karakter').max(200),
    // Kop dokumen
    schoolName: z.string().trim().min(2, 'nama sekolah minimal 2 karakter').max(150),
    schoolAddress: z.string().trim().max(300).optional(),
    academicYear: z.string().trim().max(30).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    description: z.string().trim().max(1000).optional(),
    // Penanda tangan dokumen
    signerName: z.string().trim().max(150).optional(),
    signerTitle: z.string().trim().max(150).optional(),
    signerNip: z.string().trim().max(50).optional(),
    // Ujian yang diujikan dalam event
    examIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'Tanggal selesai harus setelah tanggal mulai',
    path: ['endDate'],
  });

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3, 'judul event minimal 3 karakter').max(200).optional(),
    schoolName: z.string().trim().min(2, 'nama sekolah minimal 2 karakter').max(150).optional(),
    schoolAddress: z.string().trim().max(300).optional(),
    academicYear: z.string().trim().max(30).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    description: z.string().trim().max(1000).optional(),
    signerName: z.string().trim().max(150).optional(),
    signerTitle: z.string().trim().max(150).optional(),
    signerNip: z.string().trim().max(50).optional(),
    examIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field harus diisi',
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: 'Tanggal selesai harus setelah tanggal mulai',
    path: ['endDate'],
  });

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export const documentQuerySchema = z.object({
  classId: z.coerce.number().int().positive().optional(),
  format: z.enum(['pdf', 'docx']).default('pdf'),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
