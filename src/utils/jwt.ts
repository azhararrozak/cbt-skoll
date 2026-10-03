import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../models/user.model';

export interface AccessTokenPayload {
  id: number;
  email: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  id: number;
  jti: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES as jwt.SignOptions['expiresIn'],
  });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_EXPIRES_DAYS}d`,
  });

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
