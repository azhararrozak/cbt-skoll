import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Opsi 1: koneksi via URL (utamakan jika diisi)
  DATABASE_URL: z.string().min(1).optional(),

  // Opsi 2: koneksi ke local PostgreSQL
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('postgres'),

  JWT_ACCESS_SECRET: z.string().min(32, 'minimal 32 karakter'),
  JWT_REFRESH_SECRET: z.string().min(32, 'minimal 32 karakter'),
  ACCESS_TOKEN_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),

  // Produksi: whitelist origin dipisah koma, contoh: https://app.com,https://www.app.com
  CORS_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment variables tidak valid:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
