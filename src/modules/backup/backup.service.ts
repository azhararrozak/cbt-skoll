import { asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../config/db';
import { ApiError } from '../../utils/apiError';
import {
  classMembers,
  classes,
  examAnswers,
  examSessions,
  exams,
  questionBanks,
  questions,
  users,
} from '../../models';

const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: string;
  tables: {
    users: unknown[];
    classes: unknown[];
    class_members: unknown[];
    question_banks: unknown[];
    questions: unknown[];
    exams: unknown[];
    exam_sessions: unknown[];
    exam_answers: unknown[];
  };
}

/** Export seluruh data (kecuali sesi login/refresh token) */
export async function exportBackup(): Promise<BackupFile> {
  const [userRows, classRows, memberRows, bankRows, questionRows, examRows, sessionRows, answerRows] =
    await Promise.all([
      db.select().from(users).orderBy(asc(users.id)),
      db.select().from(classes).orderBy(asc(classes.id)),
      db.select().from(classMembers).orderBy(asc(classMembers.id)),
      db.select().from(questionBanks).orderBy(asc(questionBanks.id)),
      db.select().from(questions).orderBy(asc(questions.id)),
      db.select().from(exams).orderBy(asc(exams.id)),
      db.select().from(examSessions).orderBy(asc(examSessions.id)),
      db.select().from(examAnswers).orderBy(asc(examAnswers.id)),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      users: userRows,
      classes: classRows,
      class_members: memberRows,
      question_banks: bankRows,
      questions: questionRows,
      exams: examRows,
      exam_sessions: sessionRows,
      exam_answers: answerRows,
    },
  };
}

// ===== Restore =====

const isoDate = z
  .string()
  .transform((value, ctx) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'format tanggal tidak valid' });
      return z.NEVER;
    }
    return date;
  });
const nullableIsoDate = isoDate.nullish().transform((v) => v ?? null);

const userRow = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  password: z.string(),
  role: z.enum(['admin', 'guru', 'siswa']),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const classRow = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  grade: z.string().default('Umum'),
  jurusan: z.string().default('Umum'),
  description: z.string().nullish().transform((v) => v ?? null),
  createdBy: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const classMemberRow = z.object({
  id: z.number().int().positive(),
  classId: z.number().int().positive(),
  studentId: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const bankRow = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  subject: z.string().nullish().transform((v) => v ?? null),
  description: z.string().nullish().transform((v) => v ?? null),
  createdBy: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const questionRow = z.object({
  id: z.number().int().positive(),
  bankId: z.number().int().positive(),
  type: z.enum(['multiple_choice', 'true_false', 'short_answer']),
  questionText: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.string(),
  points: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const examRow = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullish().transform((v) => v ?? null),
  bankId: z.number().int().positive(),
  classId: z.number().int().positive(),
  token: z.string(),
  durationMinutes: z.number().int(),
  startAt: nullableIsoDate,
  endAt: nullableIsoDate,
  isPublished: z.boolean(),
  createdBy: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const sessionRow = z.object({
  id: z.number().int().positive(),
  examId: z.number().int().positive(),
  studentId: z.number().int().positive(),
  status: z.enum(['in_progress', 'completed']),
  startedAt: isoDate,
  expiresAt: isoDate,
  finishedAt: nullableIsoDate,
  score: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const answerRow = z.object({
  id: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  questionId: z.number().int().positive(),
  answer: z.string(),
  isCorrect: z.boolean(),
  pointsEarned: z.number().int(),
  answeredAt: isoDate,
  createdAt: isoDate,
  updatedAt: isoDate,
});

const backupSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  tables: z.object({
    users: z.array(userRow).default([]),
    classes: z.array(classRow).default([]),
    class_members: z.array(classMemberRow).default([]),
    question_banks: z.array(bankRow).default([]),
    questions: z.array(questionRow).default([]),
    exams: z.array(examRow).default([]),
    exam_sessions: z.array(sessionRow).default([]),
    exam_answers: z.array(answerRow).default([]),
  }),
});

/** Reset sequence serial agar insert berikutnya tidak bentrok id */
async function resetSequence(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table: string,
): Promise<void> {
  const tableName = sql.raw(`"${table}"`);
  await tx.execute(sql`
    SELECT CASE
      WHEN (SELECT COALESCE(MAX(id), 0) FROM ${tableName}) = 0
        THEN setval(pg_get_serial_sequence(${table}, 'id'), 1, false)
      ELSE setval(pg_get_serial_sequence(${table}, 'id'), (SELECT MAX(id) FROM ${tableName}), true)
    END
  `);
}

/**
 * Restore penuh dari file backup.
 * Semua data lama DIHAPUS lalu diganti dengan isi file, dalam satu transaksi:
 * gagal di tengah = tidak ada perubahan.
 */
export async function restoreBackup(buffer: Buffer): Promise<Record<string, number>> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw ApiError.badRequest('File backup bukan JSON yang valid');
  }

  const parsed = backupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw ApiError.badRequest(
      'Struktur file backup tidak dikenali. Gunakan file hasil download backup aplikasi ini.',
    );
  }
  const data = parsed.data;

  await db.transaction(async (tx) => {
    // Hapus dengan urutan aman terhadap foreign key
    await tx.delete(examAnswers);
    await tx.delete(examSessions);
    await tx.delete(exams);
    await tx.delete(questions);
    await tx.delete(questionBanks);
    await tx.delete(classMembers);
    await tx.delete(classes);
    await tx.delete(users);

    if (data.tables.users.length > 0) await tx.insert(users).values(data.tables.users);
    if (data.tables.classes.length > 0) await tx.insert(classes).values(data.tables.classes);
    if (data.tables.question_banks.length > 0)
      await tx.insert(questionBanks).values(data.tables.question_banks);
    if (data.tables.questions.length > 0) await tx.insert(questions).values(data.tables.questions);
    if (data.tables.exams.length > 0) await tx.insert(exams).values(data.tables.exams);
    if (data.tables.class_members.length > 0)
      await tx.insert(classMembers).values(data.tables.class_members);
    if (data.tables.exam_sessions.length > 0)
      await tx.insert(examSessions).values(data.tables.exam_sessions);
    if (data.tables.exam_answers.length > 0)
      await tx.insert(examAnswers).values(data.tables.exam_answers);

    await resetSequence(tx, 'users');
    await resetSequence(tx, 'classes');
    await resetSequence(tx, 'question_banks');
    await resetSequence(tx, 'questions');
    await resetSequence(tx, 'exams');
    await resetSequence(tx, 'class_members');
    await resetSequence(tx, 'exam_sessions');
    await resetSequence(tx, 'exam_answers');
  });

  return {
    users: data.tables.users.length,
    classes: data.tables.classes.length,
    class_members: data.tables.class_members.length,
    question_banks: data.tables.question_banks.length,
    questions: data.tables.questions.length,
    exams: data.tables.exams.length,
    exam_sessions: data.tables.exam_sessions.length,
    exam_answers: data.tables.exam_answers.length,
  };
}
