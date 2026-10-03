import { z } from 'zod';

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'nama minimal 2 karakter').max(100),
  email: z.string().trim().toLowerCase().email('format email tidak valid').max(255),
  password: z.string().min(8, 'password minimal 8 karakter').max(72),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('format email tidak valid'),
  password: z.string().min(1, 'password wajib diisi'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken wajib diisi'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
