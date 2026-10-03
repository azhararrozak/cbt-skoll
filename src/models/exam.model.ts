import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { classes } from './class.model';
import { questionBanks } from './question_bank.model';
import { timestamps, users } from './user.model';

export const exams = pgTable(
  'exams',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    bankId: integer('bank_id')
      .notNull()
      .references(() => questionBanks.id, { onDelete: 'cascade' }),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    // Token yang harus dimasukkan siswa untuk memulai ujian
    token: varchar('token', { length: 10 }).notNull().unique(),
    durationMinutes: integer('duration_minutes').notNull(),
    // Jadwal ujian (opsional): siswa hanya bisa memulai di antara startAt dan endAt
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    isPublished: boolean('is_published').notNull().default(false),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('exams_class_id_idx').on(table.classId), index('exams_bank_id_idx').on(table.bankId)],
);

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
