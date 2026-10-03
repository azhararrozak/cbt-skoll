import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { exams } from './exam.model';
import { questions } from './question_bank.model';
import { timestamps, users } from './user.model';

export const sessionStatusEnum = pgEnum('session_status', ['in_progress', 'completed']);

export const examSessions = pgTable(
  'exam_sessions',
  {
    id: serial('id').primaryKey(),
    examId: integer('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: sessionStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    // Batas waktu pengerjaan = startedAt + durasi ujian
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    score: integer('score').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('exam_sessions_exam_id_idx').on(table.examId),
    index('exam_sessions_student_id_idx').on(table.studentId),
  ],
);

export const examAnswers = pgTable(
  'exam_answers',
  {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => examSessions.id, { onDelete: 'cascade' }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    // Jawaban siswa: index opsi ("0","1") untuk PG/benar-salah, teks bebas untuk isian singkat
    answer: varchar('answer', { length: 500 }).notNull(),
    isCorrect: boolean('is_correct').notNull().default(false),
    pointsEarned: integer('points_earned').notNull().default(0),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    unique('exam_answers_session_question_unique').on(table.sessionId, table.questionId),
    index('exam_answers_session_id_idx').on(table.sessionId),
  ],
);

export type ExamSession = typeof examSessions.$inferSelect;
export type NewExamSession = typeof examSessions.$inferInsert;
export type ExamAnswer = typeof examAnswers.$inferSelect;
export type NewExamAnswer = typeof examAnswers.$inferInsert;
export type SessionStatus = (typeof sessionStatusEnum.enumValues)[number];
