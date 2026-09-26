import { and, count, desc, eq, sum, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  examAnswers,
  examSessions,
  exams,
  questions,
  type ExamAnswer,
  type ExamSession,
  type Question,
} from '../../models';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import type { ListSessionsInput, SubmitAnswerInput, ToggleFlagInput } from './session.schema';

async function findOrFail(id: number): Promise<ExamSession> {
  const session = await db.query.examSessions.findFirst({ where: eq(examSessions.id, id) });
  if (!session) {
    throw ApiError.notFound('Sesi ujian tidak ditemukan');
  }
  return session;
}

async function getExamOrFail(examId: number) {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) {
    throw ApiError.notFound('Ujian tidak ditemukan');
  }
  return exam;
}

function ensureOwner(session: ExamSession, actor: AuthUser): void {
  if (actor.role !== 'siswa' || session.studentId !== actor.id) {
    throw ApiError.forbidden('Anda bukan pemilik sesi ujian ini');
  }
}

async function ensureExamManageable(examId: number, actor: AuthUser): Promise<void> {
  if (actor.role === 'admin') {
    return;
  }
  const exam = await getExamOrFail(examId);
  if (exam.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke sesi ujian ini');
  }
}

function gradeAnswer(question: Question, answer: string): boolean {
  const normalized = answer.trim();
  if (question.type === 'short_answer') {
    return normalized.toLowerCase() === question.correctAnswer.trim().toLowerCase();
  }
  // multiple_choice & true_false: jawaban berupa index opsi ("0", "1", ...)
  const index = Number(normalized);
  if (!Number.isInteger(index) || index < 0) {
    return false;
  }
  if (question.type === 'true_false' && index > 1) {
    return false;
  }
  if (question.type === 'multiple_choice' && index >= question.options.length) {
    return false;
  }
  return String(index) === question.correctAnswer;
}

async function getSummary(session: ExamSession) {
  const exam = await getExamOrFail(session.examId);
  const questionList = await db
    .select({ points: questions.points })
    .from(questions)
    .where(eq(questions.bankId, exam.bankId));
  const [agg] = await db
    .select({ answered: count(), earned: sum(examAnswers.pointsEarned) })
    .from(examAnswers)
    .where(eq(examAnswers.sessionId, session.id));

  return {
    score: Number(agg.earned ?? 0),
    totalPoints: questionList.reduce((sum, q) => sum + q.points, 0),
    answeredCount: agg.answered,
    totalQuestions: questionList.length,
  };
}

// Nilai akhir = jumlah poin dari semua jawaban yang tersimpan
async function finalize(session: ExamSession, finishedAt: Date = new Date()): Promise<ExamSession> {
  const summary = await getSummary(session);
  const [updated] = await db
    .update(examSessions)
    .set({
      status: 'completed',
      finishedAt: session.finishedAt ?? finishedAt,
      score: summary.score,
      updatedAt: new Date(),
    })
    .where(eq(examSessions.id, session.id))
    .returning();

  return updated;
}

// Jika waktu sudah habis tapi sesi masih berjalan, finalisasi otomatis
async function autoFinalizeIfExpired(session: ExamSession): Promise<ExamSession> {
  if (session.status === 'in_progress' && Date.now() >= session.expiresAt.getTime()) {
    return finalize(session, session.expiresAt);
  }
  return session;
}

// Validasi sesi masih bisa dikerjakan; auto-finalisasi bila waktu habis
async function ensureActive(session: ExamSession): Promise<ExamSession> {
  const current = await autoFinalizeIfExpired(session);
  if (current.status === 'completed') {
    throw ApiError.badRequest('Waktu ujian telah berakhir atau sesi sudah selesai');
  }
  return current;
}

export const sessionService = {
  // Riwayat sesi milik siswa
  async listMine(
    studentId: number,
    params: ListSessionsInput,
  ): Promise<{
    rows: {
      id: number;
      examId: number;
      examTitle: string;
      status: string;
      score: number;
      startedAt: Date;
      expiresAt: Date;
      finishedAt: Date | null;
    }[];
    totalItems: number;
  }> {
    const where: SQL | undefined = eq(examSessions.studentId, studentId);

    const rows = await db
      .select({
        id: examSessions.id,
        examId: examSessions.examId,
        examTitle: exams.title,
        status: examSessions.status,
        score: examSessions.score,
        startedAt: examSessions.startedAt,
        expiresAt: examSessions.expiresAt,
        finishedAt: examSessions.finishedAt,
      })
      .from(examSessions)
      .innerJoin(exams, eq(exams.id, examSessions.examId))
      .where(where)
      .orderBy(desc(examSessions.startedAt))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const [totalRow] = await db
      .select({ value: count() })
      .from(examSessions)
      .where(where);

    return { rows, totalItems: totalRow.value };
  },

  // Detail sesi: daftar soal + status jawaban per soal (soal dikirim satu-satu dari sisi klien)
  async detail(
    id: number,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    let session = await findOrFail(id);

    if (actor.role === 'siswa') {
      ensureOwner(session, actor);
    } else {
      await ensureExamManageable(session.examId, actor);
    }

    session = await autoFinalizeIfExpired(session);
    const exam = await getExamOrFail(session.examId);
    const isOwnerStudent = actor.role === 'siswa' && session.studentId === actor.id;

    const questionList = await db
      .select()
      .from(questions)
      .where(eq(questions.bankId, exam.bankId))
      .orderBy(questions.id);

    // Urutkan sesuai urutan acak milik sesi (bila diacak saat mulai)
    const ordered = session.questionOrder
      ? session.questionOrder
          .map((qid) => questionList.find((q) => q.id === qid))
          .filter((q): q is Question => Boolean(q))
          .concat(questionList.filter((q) => !session.questionOrder!.includes(q.id)))
      : questionList;

    const answerList = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, session.id));

    const answerMap = new Map<number, ExamAnswer>(answerList.map((a) => [a.questionId, a]));
    // Kunci jawaban hanya dibuka jika ujian selesai (bagi siswa) atau peminta guru/admin
    const reveal = session.status === 'completed' || !isOwnerStudent;

    const items = ordered.map((question) => {
      const answer = answerMap.get(question.id);
      return {
        id: question.id,
        type: question.type,
        questionText: question.questionText,
        options: question.options,
        points: question.points,
        answered: Boolean(answer),
        answer: answer?.answer ?? null,
        ...(reveal
          ? {
              correctAnswer: question.correctAnswer,
              isCorrect: answer?.isCorrect ?? false,
              pointsEarned: answer?.pointsEarned ?? 0,
            }
          : {}),
      };
    });

    return {
      session: {
        id: session.id,
        examId: session.examId,
        status: session.status,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
        finishedAt: session.finishedAt,
        score: session.score,
        minSubmitMinutes: exam.minSubmitMinutes,
        flaggedQuestions: session.flaggedQuestions ?? [],
        remainingSeconds:
          session.status === 'in_progress'
            ? Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
            : 0,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        showScore: exam.showScore,
      },
      progress: {
        answered: answerList.length,
        total: ordered.length,
      },
      questions: items,
    };
  },

  // Simpan / perbarui jawaban satu soal (dikirim satu per satu oleh klien)
  async submitAnswer(id: number, input: SubmitAnswerInput, actor: AuthUser): Promise<ExamAnswer> {
    const session = await findOrFail(id);
    ensureOwner(session, actor);
    await ensureActive(session);

    const exam = await getExamOrFail(session.examId);
    const question = await db.query.questions.findFirst({
      where: and(eq(questions.id, input.questionId), eq(questions.bankId, exam.bankId)),
    });
    if (!question) {
      throw ApiError.notFound('Soal tidak ditemukan pada ujian ini');
    }

    const isCorrect = gradeAnswer(question, input.answer);
    const pointsEarned = isCorrect ? question.points : 0;

    const [saved] = await db
      .insert(examAnswers)
      .values({
        sessionId: session.id,
        questionId: question.id,
        answer: input.answer,
        isCorrect,
        pointsEarned,
      })
      .onConflictDoUpdate({
        target: [examAnswers.sessionId, examAnswers.questionId],
        set: {
          answer: input.answer,
          isCorrect,
          pointsEarned,
          answeredAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
  },

  // Tandai / batalkan tanda ragu-ragu pada satu soal
  async toggleFlag(id: number, input: ToggleFlagInput, actor: AuthUser): Promise<number[]> {
    const session = await findOrFail(id);
    ensureOwner(session, actor);
    await ensureActive(session);

    const current = new Set(session.flaggedQuestions ?? []);
    if (input.flagged) {
      current.add(input.questionId);
    } else {
      current.delete(input.questionId);
    }
    const flags = [...current].sort((a, b) => a - b);

    await db
      .update(examSessions)
      .set({ flaggedQuestions: flags, updatedAt: new Date() })
      .where(eq(examSessions.id, id));

    return flags;
  },

  // Selesaikan ujian: hitung nilai akhir
  async finish(id: number, actor: AuthUser): Promise<Record<string, unknown>> {
    const session = await findOrFail(id);
    ensureOwner(session, actor);

    const exam = await getExamOrFail(session.examId);

    // Siswa tidak boleh menyelesaikan ujian sebelum waktu minimal pengerjaan
    if (session.status === 'in_progress' && exam.minSubmitMinutes > 0) {
      const elapsedSec = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
      const minSec = exam.minSubmitMinutes * 60;
      if (elapsedSec < minSec && Date.now() < session.expiresAt.getTime()) {
        const waitSec = minSec - elapsedSec;
        const minutes = Math.floor(waitSec / 60);
        const seconds = waitSec % 60;
        throw ApiError.badRequest(
          `Jawaban bisa dikumpulkan mulai menit ke-${exam.minSubmitMinutes}. ` +
            `Tunggu ${minutes} menit ${seconds} detik lagi.`,
        );
      }
    }

    const current = await autoFinalizeIfExpired(session);
    const finalized = current.status === 'completed' ? current : await finalize(current);
    const summary = await getSummary(finalized);

    return {
      sessionId: finalized.id,
      status: finalized.status,
      finishedAt: finalized.finishedAt,
      ...summary,
    };
  },

  // Selesaikan paksa sesi siswa dari sisi admin/guru
  async forceFinish(id: number, actor: AuthUser): Promise<Record<string, unknown>> {
    const session = await findOrFail(id);
    if (actor.role === 'siswa') {
      throw ApiError.forbidden('Aksi ini hanya untuk admin/guru');
    }
    await ensureExamManageable(session.examId, actor);

    const current = await autoFinalizeIfExpired(session);
    if (current.status === 'completed') {
      throw ApiError.badRequest('Sesi ujian ini sudah selesai');
    }
    const finalized = await finalize(current);
    const summary = await getSummary(finalized);

    return {
      sessionId: finalized.id,
      status: finalized.status,
      finishedAt: finalized.finishedAt,
      ...summary,
    };
  },

  // Reset sesi: hapus sesi + seluruh jawabannya agar siswa dapat mulai ulang
  async reset(id: number, actor: AuthUser): Promise<{ examId: number; studentId: number }> {
    const session = await findOrFail(id);
    if (actor.role === 'siswa') {
      throw ApiError.forbidden('Aksi ini hanya untuk admin/guru');
    }
    await ensureExamManageable(session.examId, actor);

    await db.delete(examSessions).where(eq(examSessions.id, id));
    return { examId: session.examId, studentId: session.studentId };
  },

  // Hasil detail per soal (siswa setelah selesai, atau guru/admin)
  async result(id: number, actor: AuthUser): Promise<Record<string, unknown>> {
    const session = await findOrFail(id);

    if (actor.role === 'siswa') {
      ensureOwner(session, actor);
    } else {
      await ensureExamManageable(session.examId, actor);
    }

    const current = await autoFinalizeIfExpired(session);
    if (current.status !== 'completed') {
      throw ApiError.badRequest('Ujian belum selesai dikerjakan');
    }

    const exam = await getExamOrFail(current.examId);
    const questionList = await db
      .select()
      .from(questions)
      .where(eq(questions.bankId, exam.bankId))
      .orderBy(questions.id);
    const answerList = await db
      .select()
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, current.id));
    const answerMap = new Map<number, ExamAnswer>(answerList.map((a) => [a.questionId, a]));

    const items = questionList.map((question) => {
      const answer = answerMap.get(question.id);
      return {
        questionId: question.id,
        questionText: question.questionText,
        options: question.options,
        points: question.points,
        answer: answer?.answer ?? null,
        correctAnswer: question.correctAnswer,
        isCorrect: answer?.isCorrect ?? false,
        pointsEarned: answer?.pointsEarned ?? 0,
      };
    });

    return {
      sessionId: current.id,
      status: current.status,
      startedAt: current.startedAt,
      finishedAt: current.finishedAt,
      score: current.score,
      showScore: exam.showScore,
      totalPoints: items.reduce((sum, q) => sum + q.points, 0),
      totalQuestions: items.length,
      answers: items,
    };
  },
};
