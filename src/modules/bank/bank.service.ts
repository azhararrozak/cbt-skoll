import { and, asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  examAnswers,
  exams,
  questionBanks,
  questions,
  type Question,
  type QuestionBank,
  type QuestionType,
} from '../../models';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import {
  trueFalseOptions,
  type CreateBankInput,
  type CreateQuestionInput,
  type ListBanksInput,
  type UpdateBankInput,
  type UpdateQuestionInput,
} from './bank.schema';

async function findOrFail(id: number): Promise<QuestionBank> {
  const bank = await db.query.questionBanks.findFirst({ where: eq(questionBanks.id, id) });
  if (!bank) {
    throw ApiError.notFound('Bank soal tidak ditemukan');
  }
  return bank;
}

function ensureCanManage(bank: QuestionBank, actor: AuthUser): void {
  if (actor.role !== 'admin' && bank.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke bank soal ini');
  }
}

function toQuestionRow(input: CreateQuestionInput | UpdateQuestionInput) {
  if (input.type === 'multiple_choice') {
    return {
      type: input.type as QuestionType,
      questionText: input.questionText,
      options: input.options,
      correctAnswer: String(input.correctAnswer),
      points: input.points,
    };
  }
  if (input.type === 'true_false') {
    return {
      type: input.type as QuestionType,
      questionText: input.questionText,
      options: trueFalseOptions,
      correctAnswer: String(input.correctAnswer),
      points: input.points,
    };
  }
  return {
    type: input.type as QuestionType,
    questionText: input.questionText,
    options: [] as string[],
    correctAnswer: input.correctAnswer,
    points: input.points,
  };
}

export const bankService = {
  async list(
    params: ListBanksInput,
    actor: AuthUser,
  ): Promise<{ rows: (QuestionBank & { questionCount: number })[]; totalItems: number }> {
    const conditions: (SQL | undefined)[] = [];
    if (actor.role === 'guru') {
      conditions.push(eq(questionBanks.createdBy, actor.id));
    }
    if (params.search) {
      const term = `%${params.search}%`;
      conditions.push(ilike(questionBanks.name, term));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(questionBanks)
      .where(where)
      .orderBy(desc(questionBanks.createdAt))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const [totalRow] = await db.select({ value: count() }).from(questionBanks).where(where);

    const rowsWithCount = await Promise.all(
      rows.map(async (bank) => {
        const [questionRow] = await db
          .select({ value: count() })
          .from(questions)
          .where(eq(questions.bankId, bank.id));
        return { ...bank, questionCount: questionRow.value };
      }),
    );

    return { rows: rowsWithCount, totalItems: totalRow.value };
  },

  async getById(id: number, actor: AuthUser): Promise<QuestionBank & { questionCount: number }> {
    const bank = await findOrFail(id);
    ensureCanManage(bank, actor);

    const [questionRow] = await db
      .select({ value: count() })
      .from(questions)
      .where(eq(questions.bankId, id));

    return { ...bank, questionCount: questionRow.value };
  },

  async create(input: CreateBankInput, actor: AuthUser): Promise<QuestionBank> {
    const [bank] = await db
      .insert(questionBanks)
      .values({
        name: input.name,
        subject: input.subject ?? null,
        description: input.description ?? null,
        createdBy: actor.id,
      })
      .returning();

    return bank;
  },

  async update(id: number, input: UpdateBankInput, actor: AuthUser): Promise<QuestionBank> {
    const bank = await findOrFail(id);
    ensureCanManage(bank, actor);

    const [updated] = await db
      .update(questionBanks)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(questionBanks.id, id))
      .returning();

    return updated;
  },

  async remove(id: number, actor: AuthUser): Promise<void> {
    const bank = await findOrFail(id);
    ensureCanManage(bank, actor);

    const [examRow] = await db.select({ value: count() }).from(exams).where(eq(exams.bankId, id));
    if (examRow.value > 0) {
      throw ApiError.conflict('Bank soal masih dipakai oleh ujian dan tidak bisa dihapus');
    }

    await db.delete(questionBanks).where(eq(questionBanks.id, id));
  },

  async listQuestions(bankId: number, actor: AuthUser): Promise<Question[]> {
    const bank = await findOrFail(bankId);
    ensureCanManage(bank, actor);

    return db.select().from(questions).where(eq(questions.bankId, bankId)).orderBy(asc(questions.id));
  },

  async createQuestion(bankId: number, input: CreateQuestionInput, actor: AuthUser): Promise<Question> {
    const bank = await findOrFail(bankId);
    ensureCanManage(bank, actor);

    const [question] = await db
      .insert(questions)
      .values({ bankId, ...toQuestionRow(input) })
      .returning();

    return question;
  },

  async updateQuestion(
    bankId: number,
    questionId: number,
    input: UpdateQuestionInput,
    actor: AuthUser,
  ): Promise<Question> {
    const bank = await findOrFail(bankId);
    ensureCanManage(bank, actor);

    const question = await db.query.questions.findFirst({
      where: and(eq(questions.id, questionId), eq(questions.bankId, bankId)),
    });
    if (!question) {
      throw ApiError.notFound('Soal tidak ditemukan di bank soal ini');
    }

    const [updated] = await db
      .update(questions)
      .set({ ...toQuestionRow(input), updatedAt: new Date() })
      .where(eq(questions.id, questionId))
      .returning();

    return updated;
  },

  async removeQuestion(bankId: number, questionId: number, actor: AuthUser): Promise<void> {
    const bank = await findOrFail(bankId);
    ensureCanManage(bank, actor);

    const question = await db.query.questions.findFirst({
      where: and(eq(questions.id, questionId), eq(questions.bankId, bankId)),
    });
    if (!question) {
      throw ApiError.notFound('Soal tidak ditemukan di bank soal ini');
    }

    const [answerRow] = await db
      .select({ value: count() })
      .from(examAnswers)
      .where(eq(examAnswers.questionId, questionId));
    if (answerRow.value > 0) {
      throw ApiError.conflict('Soal sudah dijawab siswa dan tidak bisa dihapus');
    }

    await db.delete(questions).where(eq(questions.id, questionId));
  },
};
