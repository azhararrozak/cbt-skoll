import { defineConfig } from 'drizzle-kit';
import { env } from './src/config/env';

export default defineConfig({
  out: './drizzle',
  schema: './src/models',
  dialect: 'postgresql',
  dbCredentials: env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        ssl: false,
      },
});
