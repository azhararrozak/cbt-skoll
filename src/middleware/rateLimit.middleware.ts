import rateLimit from 'express-rate-limit';
import { isProduction } from '../config/env';

const limiterOptions = (limit: number) => ({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak request, coba lagi nanti' },
});

export const apiLimiter = rateLimit(limiterOptions(300));

export const authLimiter = rateLimit(limiterOptions(isProduction ? 10 : 100));
