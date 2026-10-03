import { randomInt } from 'crypto';
import { and, count, desc, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  classMembers,
  classes,
  examSessions,
  exams,
  questionBanks,
  questions,
  users,
  type Exam,
} from '../../models';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import type {
  CreateExamInput,
  ListExamsInput,
  StartExamInput,
  UpdateExamInput,
} from './exam.schema';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateToken(length = 6): string {
  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return token;
}

async function generateUniqueToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateToken();
    const existing = await db.query.exams.findFirst({ where: eq(exams.token, token) });
    if (!existing) {
      return token;
    }
  }
  throw ApiError.conflict('Gagal menghasilkan token unik, coba lagi');
}

async function findOrFail(id: number): Promise<Exam> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, id) });
  if (!exam) {
    throw ApiError.notFound('Ujian tidak ditemukan');
  }
  return exam;
}

function ensureCanManage(exam: Exam, actor: AuthUser): void {
  if (actor.role !== 'admin' && exam.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke ujian ini');
  }
}

async function ensureBankManageable(bankId: number, actor: AuthUser): Promise<void> {
  const bank = await db.query.questionBanks.findFirst({ where: eq(questionBanks.id, bankId) });
  if (!bank) {
    throw ApiError.notFound('Bank soal tidak ditemukan');
  }
  if (actor.role !== 'admin' && bank.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke bank soal ini');
  }
}

async function ensureClassManageable(classId: number, actor: AuthUser): Promise<void> {
  const kelas = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!kelas) {
    throw ApiError.notFound('Kelas tidak ditemukan');
  }
  if (actor.role !== 'admin' && kelas.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke kelas ini');
  }
}

export type ExamAvailability = 'open' | 'upcoming' | 'ended';

function getAvailability(exam: Exam, now: Date): ExamAvailability {
  if (exam.startAt && now < exam.startAt) {
    return 'upcoming';
  }
  if (exam.endAt && now > exam.endAt) {
    return 'ended';
  }
  return 'open';
}

export const examService = {
  async list(
    params: ListExamsInput,
    actor: AuthUser,
  ): Promise<
    {
      rows: (Exam & { bankName: string | null; className: string; sessionCount: number })[];
      totalItems: number;
    }
  > {
    const conditions: (SQL | undefined)[] = [];
    if (actor.role === 'guru') {
      conditions.push(eq(exams.createdBy, actor.id));
    }
    if (params.search) {
      conditions.push(ilike(exams.title, `%${params.search}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        exam: exams,
        bankName: questionBanks.name,
        className: classes.name,
      })
      .from(exams)
      .leftJoin(questionBanks, eq(questionBanks.id, exams.bankId))
      .innerJoin(classes, eq(classes.id, exams.classId))
      .where(where)
      .orderBy(desc(exams.createdAt))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const [totalRow] = await db.select({ value: count() }).from(exams).where(where);

    const rowsWithCount = await Promise.all(
      rows.map(async (row) => {
        const [sessionRow] = await db
          .select({ value: count() })
          .from(examSessions)
          .where(eq(examSessions.examId, row.exam.id));
        return {
          ...row.exam,
          bankName: row.bankName,
          className: row.className,
          sessionCount: sessionRow.value,
        };
      }),
    );

    return { rows: rowsWithCount, totalItems: totalRow.value };
  },

  async getById(
    id: number,
    actor: AuthUser,
  ): Promise<Exam & { bankName: string | null; className: string; totalQuestions: number }> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    const bank = await db.query.questionBanks.findFirst({ where: eq(questionBanks.id, exam.bankId) });
    const kelas = await db.query.classes.findFirst({ where: eq(classes.id, exam.classId) });
    const [questionRow] = await db
      .select({ value: count() })
      .from(questions)
      .where(eq(questions.bankId, exam.bankId));

    return {
      ...exam,
      bankName: bank?.name ?? null,
      className: kelas?.name ?? '',
      totalQuestions: questionRow.value,
    };
  },

  async create(input: CreateExamInput, actor: AuthUser): Promise<Exam> {
    await ensureBankManageable(input.bankId, actor);
    await ensureClassManageable(input.classId, actor);

    let token = input.token;
    if (token) {
      const existing = await db.query.exams.findFirst({ where: eq(exams.token, token) });
      if (existing) {
        throw ApiError.conflict('Token sudah dipakai ujian lain');
      }
    } else {
      token = await generateUniqueToken();
    }

    const [exam] = await db
      .insert(exams)
      .values({
        title: input.title,
        description: input.description ?? null,
        bankId: input.bankId,
        classId: input.classId,
        durationMinutes: input.durationMinutes,
        token,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        isPublished: input.isPublished,
        createdBy: actor.id,
      })
      .returning();

    return exam;
  },

  async update(id: number, input: UpdateExamInput, actor: AuthUser): Promise<Exam> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    if (input.bankId && input.bankId !== exam.bankId) {
      await ensureBankManageable(input.bankId, actor);
    }
    if (input.classId && input.classId !== exam.classId) {
      await ensureClassManageable(input.classId, actor);
    }
    if (input.token && input.token !== exam.token) {
      const existing = await db.query.exams.findFirst({ where: eq(exams.token, input.token) });
      if (existing) {
        throw ApiError.conflict('Token sudah dipakai ujian lain');
      }
    }

    const [updated] = await db
      .update(exams)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(exams.id, id))
      .returning();

    return updated;
  },

  async remove(id: number, actor: AuthUser): Promise<void> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    const [sessionRow] = await db
      .select({ value: count() })
      .from(examSessions)
      .where(eq(examSessions.examId, id));
    if (sessionRow.value > 0) {
      throw ApiError.conflict('Ujian sudah memiliki riwayat pengerjaan siswa dan tidak bisa dihapus');
    }

    await db.delete(exams).where(eq(exams.id, id));
  },

  async regenerateToken(id: number, actor: AuthUser): Promise<Exam> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    const token = await generateUniqueToken();
    const [updated] = await db
      .update(exams)
      .set({ token, updatedAt: new Date() })
      .where(eq(exams.id, id))
      .returning();

    return updated;
  },

  // Daftar ujian yang tersedia untuk siswa (sesuai kelasnya, sudah dipublikasikan)
  async listAvailable(studentId: number): Promise<
    {
      exam: Exam;
      bankName: string | null;
      className: string;
      availability: ExamAvailability;
      mySession: { id: number; status: string; score: number; expiresAt: Date } | null;
    }[]
  > {
    const memberships = await db
      .select({ classId: classMembers.classId })
      .from(classMembers)
      .where(eq(classMembers.studentId, studentId));

    const classIds = memberships.map((m) => m.classId);
    if (classIds.length === 0) {
      return [];
    }

    const rows = await db
      .select({ exam: exams, bankName: questionBanks.name, className: classes.name })
      .from(exams)
      .leftJoin(questionBanks, eq(questionBanks.id, exams.bankId))
      .innerJoin(classes, eq(classes.id, exams.classId))
      .where(and(eq(exams.isPublished, true), inArray(exams.classId, classIds)))
      .orderBy(desc(exams.createdAt));

    const sessions = await db
      .select()
      .from(examSessions)
      .where(
        and(eq(examSessions.studentId, studentId), inArray(examSessions.examId, rows.map((r) => r.exam.id))),
      );

    const now = new Date();
    return rows.map((row) => {
      const session = sessions.find((s) => s.examId === row.exam.id);
      return {
        exam: row.exam,
        bankName: row.bankName,
        className: row.className,
        availability: getAvailability(row.exam, now),
        mySession: session
          ? {
              id: session.id,
              status: session.status,
              score: session.score,
              expiresAt: session.expiresAt,
            }
          : null,
      };
    });
  },

  // Siswa memulai ujian dengan token; jika ada sesi berjalan, sesi tersebut dilanjutkan
  async start(
    examId: number,
    input: StartExamInput,
    studentId: number,
  ): Promise<{ session: typeof examSessions.$inferSelect; resumed: boolean; totalQuestions: number }> {
    const exam = await findOrFail(examId);
    if (!exam.isPublished) {
      throw ApiError.forbidden('Ujian belum dipublikasikan');
    }

    const now = new Date();
    const availability = getAvailability(exam, now);
    if (availability === 'upcoming') {
      throw ApiError.badRequest(`Ujian belum dibuka, mulai ${exam.startAt?.toISOString()}`);
    }
    if (availability === 'ended') {
      throw ApiError.badRequest('Ujian sudah ditutup');
    }

    const membership = await db.query.classMembers.findFirst({
      where: and(eq(classMembers.classId, exam.classId), eq(classMembers.studentId, studentId)),
    });
    if (!membership) {
      throw ApiError.forbidden('Anda tidak terdaftar di kelas ujian ini');
    }

    if (exam.token !== input.token) {
      throw ApiError.badRequest('Token ujian salah');
    }

    const existing = await db.query.examSessions.findFirst({
      where: and(eq(examSessions.examId, examId), eq(examSessions.studentId, studentId)),
    });

    if (existing) {
      if (existing.status === 'completed') {
        throw ApiError.conflict('Anda sudah menyelesaikan ujian ini');
      }
      const [questionRow] = await db
        .select({ value: count() })
        .from(questions)
        .where(eq(questions.bankId, exam.bankId));
      return { session: existing, resumed: true, totalQuestions: questionRow.value };
    }

    const expiresAt = new Date(now.getTime() + exam.durationMinutes * 60 * 1000);
    const cappedEnd = exam.endAt && exam.endAt < expiresAt ? exam.endAt : expiresAt;

    const [session] = await db
      .insert(examSessions)
      .values({
        examId,
        studentId,
        status: 'in_progress',
        startedAt: now,
        expiresAt: cappedEnd,
      })
      .returning();

    const [questionRow] = await db
      .select({ value: count() })
      .from(questions)
      .where(eq(questions.bankId, exam.bankId));

    return { session, resumed: false, totalQuestions: questionRow.value };
  },

  // Rekap hasil ujian untuk guru/admin
  async results(
    examId: number,
    actor: AuthUser,
  ): Promise<{
    exam: Exam;
    totalQuestions: number;
    totalPoints: number;
    rows: {
      sessionId: number;
      studentId: number;
      studentName: string;
      studentEmail: string;
      status: string;
      score: number;
      startedAt: Date;
      expiresAt: Date;
      finishedAt: Date | null;
    }[];
  }> {
    const exam = await findOrFail(examId);
    ensureCanManage(exam, actor);

    const rows = await db
      .select({
        sessionId: examSessions.id,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        status: examSessions.status,
        score: examSessions.score,
        startedAt: examSessions.startedAt,
        expiresAt: examSessions.expiresAt,
        finishedAt: examSessions.finishedAt,
      })
      .from(examSessions)
      .innerJoin(users, eq(users.id, examSessions.studentId))
      .where(eq(examSessions.examId, examId))
      .orderBy(desc(examSessions.score));

    const questionList = await db
      .select({ points: questions.points })
      .from(questions)
      .where(eq(questions.bankId, exam.bankId));
    const totalPoints = questionList.reduce((sum, q) => sum + q.points, 0);

    return {
      exam,
      totalQuestions: questionList.length,
      totalPoints,
      rows,
    };
  },
};
