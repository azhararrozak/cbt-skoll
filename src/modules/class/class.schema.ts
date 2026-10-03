import { z } from 'zod';

export const createClassSchema = z.object({
  name: z.string().trim().min(2, 'nama kelas minimal 2 karakter').max(150),
  description: z.string().trim().max(1000).optional(),
});

export const updateClassSchema = z
  .object({
    name: z.string().trim().min(2, 'nama kelas minimal 2 karakter').max(150).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field (name/description) harus diisi',
  });

export const listClassesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
});

export const addClassMembersSchema = z.object({
  studentIds: z
    .array(z.coerce.number().int().positive('id siswa harus angka positif'))
    .min(1, 'Minimal satu id siswa')
    .max(200),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export const classMemberParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
  studentId: z.coerce.number().int().positive('studentId harus berupa angka positif'),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type ListClassesInput = z.infer<typeof listClassesSchema>;
export type AddClassMembersInput = z.infer<typeof addClassMembersSchema>;
