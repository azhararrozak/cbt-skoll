import { z } from 'zod';
import { userRoleEnum } from '../../models/user.model';

export const userRoleSchema = z.enum(userRoleEnum.enumValues);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('format email tidak valid').max(255),
  password: z.string().min(8, 'password minimal 8 karakter').max(72),
  role: userRoleSchema.default('siswa'),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100).optional(),
    email: z.string().trim().toLowerCase().email('format email tidak valid').max(255).optional(),
    role: userRoleSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field (name/email/role) harus diisi',
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
