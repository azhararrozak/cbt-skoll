import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { timestamps, users } from './user.model';

export const questionTypeEnum = pgEnum('question_type', [
  'multiple_choice',
  'true_false',
  'short_answer',
]);

export const questionBanks = pgTable('question_banks', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  subject: varchar('subject', { length: 100 }),
  description: text('description'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const questions = pgTable(
  'questions',
  {
    id: serial('id').primaryKey(),
    bankId: integer('bank_id')
      .notNull()
      .references(() => questionBanks.id, { onDelete: 'cascade' }),
    type: questionTypeEnum('type').notNull().default('multiple_choice'),
    questionText: text('question_text').notNull(),
    // Pilihan jawaban (untuk pilihan ganda & benar/salah), misal: ["Jakarta", "Bandung"]
    options: jsonb('options').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // Kunci jawaban: pilihan ganda/benar-salah = index opsi ("0","1"), isian singkat = teks jawaban
    correctAnswer: varchar('correct_answer', { length: 500 }).notNull(),
    points: integer('points').notNull().default(1),
    ...timestamps,
  },
  (table) => [index('questions_bank_id_idx').on(table.bankId)],
);

export type QuestionBank = typeof questionBanks.$inferSelect;
export type NewQuestionBank = typeof questionBanks.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];
