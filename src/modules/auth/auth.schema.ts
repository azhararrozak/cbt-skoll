import { z } from 'zod';

export const signInSchema = z.object({
  // Admin/guru masuk dengan email, siswa masuk dengan NISN (fallback NIS sekolah)
  identifier: z
    .string({ message: 'Email atau NISN wajib diisi' })
    .trim()
    .min(1, 'Email atau NISN wajib diisi')
    .max(255),
  password: z.string().min(1, 'password wajib diisi'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken wajib diisi'),
});

export type SignInInput = z.infer<typeof signInSchema>;
