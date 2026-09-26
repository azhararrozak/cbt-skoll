import bcrypt from 'bcryptjs';
import { and, count, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import { refreshTokens, users, type User, type UserRole } from '../../models';
import { ApiError } from '../../utils/apiError';
import type { CreateUserInput, ListUsersInput, UpdateUserInput } from './user.schema';

const BCRYPT_ROUNDS = 10;

async function countAdmins(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users).where(eq(users.role, 'admin'));
  return row.value;
}

async function revokeActiveRefreshTokens(userId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

async function findOrFail(id: number): Promise<User> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) {
    throw ApiError.notFound('User tidak ditemukan');
  }
  return user;
}

export const userService = {
  async list(
    params: ListUsersInput,
  ): Promise<{ rows: Omit<User, 'password'>[]; totalItems: number }> {
    const conditions: (SQL | undefined)[] = [];
    if (params.role) {
      conditions.push(eq(users.role, params.role));
    }
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(or(ilike(users.name, term), ilike(users.email, term), ilike(users.nisn, term)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        nis: users.nis,
        nisn: users.nisn,
        role: users.role,
        initialPassword: users.initialPassword,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const [totalRow] = await db.select({ value: count() }).from(users).where(where);

    return { rows, totalItems: totalRow.value };
  },

  getById(id: number): Promise<User> {
    return findOrFail(id);
  },

  async create(input: CreateUserInput, actingUserRole: UserRole): Promise<User> {
    if (actingUserRole === 'guru' && input.role !== 'siswa') {
      throw ApiError.forbidden('Guru hanya bisa membuat akun siswa');
    }

    // Email siswa opsional: dibuat otomatis dari NISN
    const email =
      input.role === 'siswa' && !input.email
        ? `${input.nisn}@siswa.cbt.local`
        : (input.email as string);

    const existingByEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingByEmail) {
      throw ApiError.conflict('Email sudah terdaftar');
    }

    if (input.nisn) {
      const existingByNisn = await db.query.users.findFirst({
        where: eq(users.nisn, input.nisn),
      });
      if (existingByNisn) {
        throw ApiError.conflict('NISN sudah terdaftar');
      }
    }

    const hashed = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email,
        nis: input.nis || null,
        nisn: input.nisn || null,
        password: hashed,
        initialPassword: input.password,
        role: input.role,
      })
      .returning();

    return user;
  },

  async update(id: number, input: UpdateUserInput, actingUserId: number): Promise<User> {
    const user = await findOrFail(id);

    if (input.nisn && input.nisn !== user.nisn) {
      const existingByNisn = await db.query.users.findFirst({
        where: eq(users.nisn, input.nisn),
      });
      if (existingByNisn) {
        throw ApiError.conflict('NISN sudah terdaftar');
      }
    }

    if (input.email && input.email !== user.email) {
      const existing = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });
      if (existing) {
        throw ApiError.conflict('Email sudah terdaftar');
      }
    }

    let shouldRevokeTokens = false;
    if (input.role && input.role !== user.role) {
      if (id === actingUserId) {
        throw ApiError.badRequest('Tidak bisa mengubah role akun sendiri');
      }
      if (user.role === 'admin' && input.role !== 'admin' && (await countAdmins()) <= 1) {
        throw ApiError.badRequest('Tidak bisa menurunkan satu-satunya admin');
      }
      shouldRevokeTokens = true;
    }
    if ((input.email && input.email !== user.email) || (input.nisn && input.nisn !== user.nisn)) {
      shouldRevokeTokens = true;
    }

    const [updated] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (shouldRevokeTokens) {
      await revokeActiveRefreshTokens(id);
    }

    return updated;
  },

  async remove(id: number, actingUserId: number): Promise<void> {
    if (id === actingUserId) {
      throw ApiError.badRequest('Tidak bisa menghapus akun sendiri');
    }

    const user = await findOrFail(id);
    if (user.role === 'admin' && (await countAdmins()) <= 1) {
      throw ApiError.badRequest('Tidak bisa menghapus satu-satunya admin');
    }

    await db.delete(users).where(eq(users.id, id));
  },
};
