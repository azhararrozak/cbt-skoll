import { randomInt } from 'crypto';
import { and, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  classMembers,
  classes,
  examClasses,
  examAnswers,
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
    throw ApiError.notFound(`Kelas dengan id ${classId} tidak ditemukan`);
  }
  if (actor.role !== 'admin' && kelas.createdBy !== actor.id) {
    throw ApiError.forbidden(`Anda tidak memiliki akses ke kelas "${kelas.name}"`);
  }
}

/** Ambil daftar kelas peserta sebuah ujian */
async function getExamClasses(examIds: number[]): Promise<Map<number, { id: number; name: string; grade: string }[]>> {
  const result = new Map<number, { id: number; name: string; grade: string }[]>();
  if (examIds.length === 0) return result;

  const rows = await db
    .select({ examId: examClasses.examId, id: classes.id, name: classes.name, grade: classes.grade })
    .from(examClasses)
    .innerJoin(classes, eq(classes.id, examClasses.classId))
    .where(inArray(examClasses.examId, examIds));

  for (const row of rows) {
    const list = result.get(row.examId) ?? [];
    list.push({ id: row.id, name: row.name, grade: row.grade });
    result.set(row.examId, list);
  }
  return result;
}

/** Acak urutan id soal (Fisher-Yates) untuk sesi ujian */
async function buildQuestionOrder(bankId: number): Promise<number[]> {
  const rows = await db.select({ id: questions.id }).from(questions).where(eq(questions.bankId, bankId));
  const ids = rows.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
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
      rows: (Exam & { bankName: string | null; classNames: string; classIds: number[]; sessionCount: number })[];
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
      .select({ exam: exams, bankName: questionBanks.name })
      .from(exams)
      .leftJoin(questionBanks, eq(questionBanks.id, exams.bankId))
      .where(where)
      .orderBy(desc(exams.createdAt))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const classMap = await getExamClasses(rows.map((r) => r.exam.id));

    const [totalRow] = await db.select({ value: count() }).from(exams).where(where);

    const rowsWithCount = await Promise.all(
      rows.map(async (row) => {
        const [sessionRow] = await db
          .select({ value: count() })
          .from(examSessions)
          .where(eq(examSessions.examId, row.exam.id));
        const kelas = classMap.get(row.exam.id) ?? [];
        return {
          ...row.exam,
          bankName: row.bankName,
          classNames: kelas.map((k) => k.name).join(', ') || '-',
          classIds: kelas.map((k) => k.id),
          sessionCount: sessionRow.value,
        };
      }),
    );

    return { rows: rowsWithCount, totalItems: totalRow.value };
  },

  async getById(
    id: number,
    actor: AuthUser,
  ): Promise<
    Exam & {
      bankName: string | null;
      classNames: string;
      classIds: number[];
      totalQuestions: number;
    }
  > {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    const bank = await db.query.questionBanks.findFirst({ where: eq(questionBanks.id, exam.bankId) });
    const classMap = await getExamClasses([id]);
    const kelas = classMap.get(id) ?? [];
    const [questionRow] = await db
      .select({ value: count() })
      .from(questions)
      .where(eq(questions.bankId, exam.bankId));

    return {
      ...exam,
      bankName: bank?.name ?? null,
      classNames: kelas.map((k) => k.name).join(', '),
      classIds: kelas.map((k) => k.id),
      totalQuestions: questionRow.value,
    };
  },

  async create(input: CreateExamInput, actor: AuthUser): Promise<Exam> {
    await ensureBankManageable(input.bankId, actor);
    for (const classId of input.classIds) {
      await ensureClassManageable(classId, actor);
    }

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
        durationMinutes: input.durationMinutes,
        minSubmitMinutes: input.minSubmitMinutes,
        showScore: input.showScore,
        shuffleQuestions: input.shuffleQuestions,
        token,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        isPublished: input.isPublished,
        createdBy: actor.id,
      })
      .returning();

    await db
      .insert(examClasses)
      .values([...new Set(input.classIds)].map((classId) => ({ examId: exam.id, classId })));

    return exam;
  },

  async update(id: number, input: UpdateExamInput, actor: AuthUser): Promise<Exam> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    if (input.bankId && input.bankId !== exam.bankId) {
      await ensureBankManageable(input.bankId, actor);
    }
    if (input.classIds) {
      for (const classId of input.classIds) {
        await ensureClassManageable(classId, actor);
      }
    }
    if (input.token && input.token !== exam.token) {
      const existing = await db.query.exams.findFirst({ where: eq(exams.token, input.token) });
      if (existing) {
        throw ApiError.conflict('Token sudah dipakai ujian lain');
      }
    }
    if (input.minSubmitMinutes !== undefined && input.minSubmitMinutes >= exam.durationMinutes) {
      throw ApiError.badRequest('Waktu minimal submit harus lebih pendek dari durasi ujian');
    }

    const [updated] = await db
      .update(exams)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(exams.id, id))
      .returning();

    if (input.classIds) {
      await db.delete(examClasses).where(eq(examClasses.examId, id));
      await db
        .insert(examClasses)
        .values([...new Set(input.classIds)].map((classId) => ({ examId: id, classId })));
    }

    return updated;
  },

  async remove(id: number, actor: AuthUser, force = false): Promise<void> {
    const exam = await findOrFail(id);
    ensureCanManage(exam, actor);

    const [sessionRow] = await db
      .select({ value: count() })
      .from(examSessions)
      .where(eq(examSessions.examId, id));
    if (sessionRow.value > 0) {
      // Hapus permanen ujian = ikut menghapus seluruh nilai & jawaban siswa (cascade).
      // Itu keputusan berat, jadi hanya admin yang boleh, dan harus sadar (force).
      if (!force) {
        throw ApiError.conflict(
          `Ujian sudah dikerjakan oleh ${sessionRow.value} siswa sehingga tidak bisa dihapus biasa. ` +
            'Gunakan opsi hapus permanen untuk menghapusnya beserta seluruh nilai siswa',
        );
      }
      if (actor.role !== 'admin') {
        throw ApiError.forbidden(
          'Hanya admin yang dapat menghapus ujian yang sudah memiliki riwayat pengerjaan',
        );
      }
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
      classNames: string;
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

    // Ujian yang ditugaskan ke salah satu kelas siswa
    const examClassRows = await db
      .select({ examId: examClasses.examId })
      .from(examClasses)
      .where(inArray(examClasses.classId, classIds));
    const examIds = [...new Set(examClassRows.map((r) => r.examId))];
    if (examIds.length === 0) {
      return [];
    }

    const rows = await db
      .select({ exam: exams, bankName: questionBanks.name })
      .from(exams)
      .leftJoin(questionBanks, eq(questionBanks.id, exams.bankId))
      .where(and(eq(exams.isPublished, true), inArray(exams.id, examIds)))
      .orderBy(desc(exams.createdAt));

    const classMap = await getExamClasses(rows.map((r) => r.exam.id));

    const sessions = await db
      .select()
      .from(examSessions)
      .where(
        and(
          eq(examSessions.studentId, studentId),
          inArray(
            examSessions.examId,
            rows.map((r) => r.exam.id),
          ),
        ),
      );

    const now = new Date();
    return rows.map((row) => {
      const session = sessions.find((s) => s.examId === row.exam.id);
      const kelas = classMap.get(row.exam.id) ?? [];
      return {
        exam: row.exam,
        bankName: row.bankName,
        classNames: kelas.map((k) => k.name).join(', '),
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

    // Siswa harus terdaftar di salah satu kelas peserta ujian
    const examClassRows = await db
      .select({ classId: examClasses.classId })
      .from(examClasses)
      .where(eq(examClasses.examId, examId));
    const allowedClassIds = examClassRows.map((r) => r.classId);
    if (allowedClassIds.length === 0) {
      throw ApiError.forbidden('Ujian ini belum memiliki kelas peserta');
    }

    const membership = await db.query.classMembers.findFirst({
      where: and(
        inArray(classMembers.classId, allowedClassIds),
        eq(classMembers.studentId, studentId),
      ),
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

    // Acak urutan soal bila diminta; urutan tetap saat siswa melanjutkan
    const questionOrder = exam.shuffleQuestions
      ? await buildQuestionOrder(exam.bankId)
      : null;

    const [session] = await db
      .insert(examSessions)
      .values({
        examId,
        studentId,
        status: 'in_progress',
        startedAt: now,
        expiresAt: cappedEnd,
        questionOrder,
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

  // Pemantauan pengerjaan siswa: progres jawaban + sisa waktu per sesi
  async monitoring(
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
      answeredCount: number;
      flaggedCount: number;
      remainingSeconds: number;
      startedAt: Date;
      expiresAt: Date;
      finishedAt: Date | null;
    }[];
  }> {
    const exam = await findOrFail(examId);
    ensureCanManage(exam, actor);

    const questionList = await db
      .select({ points: questions.points })
      .from(questions)
      .where(eq(questions.bankId, exam.bankId));
    const totalQuestions = questionList.length;
    const totalPoints = questionList.reduce((sum, q) => sum + q.points, 0);

    const rows = await db
      .select({
        sessionId: examSessions.id,
        studentId: users.id,
        studentName: users.name,
        studentEmail: users.email,
        status: examSessions.status,
        score: examSessions.score,
        flaggedQuestions: examSessions.flaggedQuestions,
        startedAt: examSessions.startedAt,
        expiresAt: examSessions.expiresAt,
        finishedAt: examSessions.finishedAt,
      })
      .from(examSessions)
      .innerJoin(users, eq(users.id, examSessions.studentId))
      .where(eq(examSessions.examId, examId))
      .orderBy(desc(examSessions.startedAt));

    const sessionIds = rows.map((r) => r.sessionId);
    const answerCounts = sessionIds.length
      ? await db
          .select({ sessionId: examAnswers.sessionId, value: count() })
          .from(examAnswers)
          .where(inArray(examAnswers.sessionId, sessionIds))
          .groupBy(examAnswers.sessionId)
      : [];
    const answerMap = new Map(answerCounts.map((a) => [a.sessionId, a.value]));

    const now = Date.now();
    return {
      exam,
      totalQuestions,
      totalPoints,
      rows: rows.map((r) => ({
        sessionId: r.sessionId,
        studentId: r.studentId,
        studentName: r.studentName,
        studentEmail: r.studentEmail,
        status: r.status,
        score: r.score,
        answeredCount: answerMap.get(r.sessionId) ?? 0,
        flaggedCount: (r.flaggedQuestions ?? []).length,
        remainingSeconds:
          r.status === 'in_progress'
            ? Math.max(0, Math.floor((r.expiresAt.getTime() - now) / 1000))
            : 0,
        startedAt: r.startedAt,
        expiresAt: r.expiresAt,
        finishedAt: r.finishedAt,
      })),
    };
  },

  // Ringkasan ujian yang sedang berlangsung (untuk widget dashboard)
  async activeSummary(
    actor: AuthUser,
  ): Promise<{ examId: number; title: string; inProgress: number; completed: number }[]> {
    const conditions: (SQL | undefined)[] = [];
    if (actor.role === 'guru') {
      conditions.push(eq(exams.createdBy, actor.id));
    }

    const rows = await db
      .select({
        examId: exams.id,
        title: exams.title,
        inProgress:
          sql<number>`cast(count(*) filter (where ${examSessions.status} = 'in_progress') as int)`,
        completed:
          sql<number>`cast(count(*) filter (where ${examSessions.status} = 'completed') as int)`,
      })
      .from(examSessions)
      .innerJoin(exams, eq(exams.id, examSessions.examId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(exams.id, exams.title)
      .having(
        sql`cast(count(*) filter (where ${examSessions.status} = 'in_progress') as int) > 0`,
      )
      .orderBy(desc(exams.id));

    return rows;
  },
};
