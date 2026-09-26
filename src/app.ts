import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/user/user.routes';
import classRoutes from './modules/class/class.routes';
import bankRoutes from './modules/bank/bank.routes';
import examRoutes from './modules/exam/exam.routes';
import sessionRoutes from './modules/session/session.routes';
import importRoutes from './modules/import/import.routes';
import backupRoutes from './modules/backup/backup.routes';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin:
      env.NODE_ENV === 'production'
        ? env.CORS_ORIGIN?.split(',').map((origin) => origin.trim())
        : '*',
    // Agar frontend bisa membaca nama file saat mengunduh template/backup
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use(express.json());
app.use('/api', apiLimiter);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    data: { env: env.NODE_ENV },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/banks', bankRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/backup', backupRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
