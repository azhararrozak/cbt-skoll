import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
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
    // Token yang harus dimasukkan siswa untuk memulai ujian
    token: varchar('token', { length: 10 }).notNull().unique(),
    durationMinutes: integer('duration_minutes').notNull(),
    // Minimal menit pengerjaan sebelum siswa boleh menyelesaikan ujian (0 = bebas)
    minSubmitMinutes: integer('min_submit_minutes').notNull().default(0),
    // Tampilkan nilai ke siswa setelah selesai?
    showScore: boolean('show_score').notNull().default(true),
    // Acak urutan soal untuk tiap siswa?
    shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
    // Jadwal ujian (opsional): siswa hanya bisa memulai di antara startAt dan endAt
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    isPublished: boolean('is_published').notNull().default(false),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    index('exams_bank_id_idx').on(table.bankId),
    index('exams_created_by_idx').on(table.createdBy),
  ],
);

/** Relasi ujian <-> kelas (satu ujian bisa untuk banyak kelas) */
export const examClasses = pgTable(
  'exam_classes',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    unique('exam_classes_exam_class_unique').on(table.examId, table.classId),
    index('exam_classes_class_id_idx').on(table.classId),
  ],
);

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamClass = typeof examClasses.$inferSelect;
export type NewExamClass = typeof examClasses.$inferInsert;
