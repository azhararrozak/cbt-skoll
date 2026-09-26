import { pgEnum, pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['admin', 'guru', 'siswa']);

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  // NISN: identitas utama siswa untuk login (unik, boleh kosong untuk guru/admin)
  nisn: varchar('nisn', { length: 20 }).unique(),
  // NIS: nomor induk sekolah (identitas internal sekolah, pelengkap NISN)
  nis: varchar('nis', { length: 30 }),
  password: varchar('password', { length: 255 }).notNull(),
  // Password awal (plain text) untuk ditampilkan di kartu peserta; nullable untuk backward compat
  initialPassword: varchar('initial_password', { length: 255 }),
  role: userRoleEnum('role').notNull().default('siswa'),
  ...timestamps,
});

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
