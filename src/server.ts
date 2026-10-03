import app from './app';
import { pool } from './config/db';
import { env } from './config/env';

pool
  .connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL');
  })
  .catch((err) => {
    console.error('❌ Failed to connect to PostgreSQL:', err);
  });

const server = app.listen(env.PORT, () => {
  console.log(`Server running at http://127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} diterima, mematikan server...`);
  server.close(async () => {
    await pool.end();
    console.log('Server ditutup dengan aman');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
