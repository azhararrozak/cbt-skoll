import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';
import type { UserRole } from '../models/user.model';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}

export const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const legacy = req.headers['x-access-token'];
  return typeof legacy === 'string' && legacy.length > 0 ? legacy : null;
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const token = extractToken(req);
  if (!token) {
    next(
      ApiError.unauthorized(
        'Token tidak ditemukan (kirim via header Authorization: Bearer <token>)',
      ),
    );
    return;
  }

  try {
    req.user = verifyAccessToken(token) as AuthUser;
    next();
  } catch {
    next(ApiError.unauthorized('Token tidak valid atau kedaluwarsa'));
  }
};

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Autentikasi diperlukan'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('Anda tidak memiliki akses ke resource ini'));
      return;
    }
    next();
  };
