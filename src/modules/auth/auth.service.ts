import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db';
import { env } from '../../config/env';
import { refreshTokens, users, type User, type UserRole } from '../../models';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { ApiError } from '../../utils/apiError';
import type { SignInInput, SignUpInput } from './auth.schema';

const BCRYPT_ROUNDS = 10;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(user: {
  id: number;
  email: string;
  role: UserRole;
}): Promise<TokenPair> {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({ userId: user.id, jti, expiresAt });

  return {
    accessToken: signAccessToken({ id: user.id, email: user.email, role: user.role }),
    refreshToken: signRefreshToken({ id: user.id, jti }),
  };
}

export const authService = {
  async register(input: SignUpInput): Promise<{ user: User } & TokenPair> {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });
    if (existing) {
      throw ApiError.conflict('Email sudah terdaftar');
    }

    const hashed = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({ name: input.name, email: input.email, password: hashed })
      .returning();

    return { user, ...(await issueTokens(user)) };
  },

  async login(input: SignInInput): Promise<{ user: User } & TokenPair> {
    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email),
    });
    if (!user) {
      throw ApiError.unauthorized('Email atau password salah');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.password);
    if (!isValidPassword) {
      throw ApiError.unauthorized('Email atau password salah');
    }

    return { user, ...(await issueTokens(user)) };
  },

  async refreshSession(refreshToken: string): Promise<{ user: User } & TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Refresh token tidak valid atau kedaluwarsa');
    }

    const stored = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.jti, payload.jti),
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token sudah dicabut atau kedaluwarsa');
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, stored.userId),
    });
    if (!user) {
      throw ApiError.unauthorized('User tidak ditemukan');
    }

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.jti, payload.jti));

    return { user, ...(await issueTokens(user)) };
  },

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.jti, payload.jti));
    } catch {
      // token tidak valid pun tetap dianggap logout sukses
    }
  },

  async getCurrentUser(id: number): Promise<User> {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) {
      throw ApiError.notFound('User tidak ditemukan');
    }
    return user;
  },
};
