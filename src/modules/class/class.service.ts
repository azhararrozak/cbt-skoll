import { and, asc, count, eq, ilike, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../config/db';
import { classMembers, classes, examClasses, users, type Kelas } from '../../models';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import type {
  AddClassMembersInput,
  CreateClassInput,
  ListClassesInput,
  UpdateClassInput,
} from './class.schema';

async function findOrFail(id: number): Promise<Kelas> {
  const kelas = await db.query.classes.findFirst({ where: eq(classes.id, id) });
  if (!kelas) {
    throw ApiError.notFound('Kelas tidak ditemukan');
  }
  return kelas;
}

function ensureCanManage(kelas: Kelas, actor: AuthUser): void {
  if (actor.role !== 'admin' && kelas.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke kelas ini');
  }
}

export const classService = {
  async list(
    params: ListClassesInput,
    actor: AuthUser,
  ): Promise<{ rows: (Kelas & { studentCount: number })[]; totalItems: number }> {
    const conditions: (SQL | undefined)[] = [];
    if (actor.role === 'guru') {
      conditions.push(eq(classes.createdBy, actor.id));
    }
    if (params.search) {
      conditions.push(ilike(classes.name, `%${params.search}%`));
    }
    if (params.grade) {
      conditions.push(eq(classes.grade, params.grade));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Urutkan per jenjang lalu nama kelas agar mudah dikelompokkan di UI
    const rows = await db
      .select()
      .from(classes)
      .where(where)
      .orderBy(asc(classes.grade), asc(classes.name))
      .limit(params.limit)
      .offset((params.page - 1) * params.limit);

    const [totalRow] = await db.select({ value: count() }).from(classes).where(where);

    const rowsWithCount = await Promise.all(
      rows.map(async (kelas) => {
        const [memberRow] = await db
          .select({ value: count() })
          .from(classMembers)
          .where(eq(classMembers.classId, kelas.id));
        return { ...kelas, studentCount: memberRow.value };
      }),
    );

    return { rows: rowsWithCount, totalItems: totalRow.value };
  },

  async getById(id: number, actor: AuthUser): Promise<Kelas> {
    const kelas = await findOrFail(id);
    ensureCanManage(kelas, actor);
    return kelas;
  },

  async create(input: CreateClassInput, actor: AuthUser): Promise<Kelas> {
    const [kelas] = await db
      .insert(classes)
      .values({
        name: input.name,
        grade: input.grade,
        jurusan: input.jurusan,
        description: input.description ?? null,
        createdBy: actor.id,
      })
      .returning();

    return kelas;
  },

  async update(id: number, input: UpdateClassInput, actor: AuthUser): Promise<Kelas> {
    const kelas = await findOrFail(id);
    ensureCanManage(kelas, actor);

    const [updated] = await db
      .update(classes)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(classes.id, id))
      .returning();

    return updated;
  },

  async remove(id: number, actor: AuthUser): Promise<void> {
    const kelas = await findOrFail(id);
    ensureCanManage(kelas, actor);

    const [examRow] = await db
      .select({ value: count() })
      .from(examClasses)
      .where(eq(examClasses.classId, id));
    if (examRow.value > 0) {
      throw ApiError.conflict('Kelas masih menjadi peserta ujian dan tidak bisa dihapus');
    }

    await db.delete(classes).where(eq(classes.id, id));
  },

  async listMembers(
    classId: number,
    actor: AuthUser,
  ): Promise<{ id: number; name: string; email: string; nis: string | null; nisn: string | null }[]> {
    const kelas = await findOrFail(classId);
    ensureCanManage(kelas, actor);

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        nis: users.nis,
        nisn: users.nisn,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .where(eq(classMembers.classId, classId))
      .orderBy(asc(users.name));

    return rows;
  },

  async addMembers(classId: number, input: AddClassMembersInput, actor: AuthUser): Promise<number> {
    const kelas = await findOrFail(classId);
    ensureCanManage(kelas, actor);

    const uniqueIds = [...new Set(input.studentIds)];
    const students = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, uniqueIds), eq(users.role, 'siswa')));

    if (students.length !== uniqueIds.length) {
      throw ApiError.badRequest('Beberapa id siswa tidak ditemukan atau bukan akun siswa');
    }

    const inserted = await db
      .insert(classMembers)
      .values(uniqueIds.map((studentId) => ({ classId, studentId })))
      .onConflictDoNothing()
      .returning({ id: classMembers.id });

    return inserted.length;
  },

  async removeMember(classId: number, studentId: number, actor: AuthUser): Promise<void> {
    const kelas = await findOrFail(classId);
    ensureCanManage(kelas, actor);

    const deleted = await db
      .delete(classMembers)
      .where(and(eq(classMembers.classId, classId), eq(classMembers.studentId, studentId)))
      .returning({ id: classMembers.id });

    if (deleted.length === 0) {
      throw ApiError.notFound('Siswa tidak ditemukan di kelas ini');
    }
  },
};
