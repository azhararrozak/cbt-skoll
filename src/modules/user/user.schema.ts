import { z } from 'zod';
import { userRoleEnum } from '../../models/user.model';

export const userRoleSchema = z.enum(userRoleEnum.enumValues);

const nisnField = z
  .string()
  .trim()
  .regex(/^\d{4,20}$/, 'NISN harus berupa 4-20 digit angka');

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('format email tidak valid')
      .max(255)
      .optional()
      .or(z.literal('')),
    // Siswa diidentifikasi dengan NISN; email siswa dibuat otomatis bila kosong
    nisn: nisnField.optional().or(z.literal('')),
    // NIS sekolah (identitas internal, opsional)
    nis: z.string().trim().max(30).optional().or(z.literal('')),
    password: z.string().min(8, 'password minimal 8 karakter').max(72),
    role: userRoleSchema.default('siswa'),
  })
  .refine((data) => data.role !== 'siswa' || (data.nisn && data.nisn.length > 0), {
    message: 'NISN wajib diisi untuk akun siswa',
    path: ['nisn'],
  })
  .refine((data) => data.role === 'siswa' || (data.email && data.email.length > 0), {
    message: 'Email wajib diisi untuk akun guru/admin',
    path: ['email'],
  });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('format email tidak valid')
      .max(255)
      .optional(),
    nisn: nisnField.optional(),
    nis: z.string().trim().max(30).optional(),
    role: userRoleSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field (name/email/nisn/role) harus diisi',
  });

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(100).optional(),
  role: userRoleSchema.optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id harus berupa angka positif'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
