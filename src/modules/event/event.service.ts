import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  classMembers,
  classes,
  eventExams,
  events,
  examClasses,
  exams,
  users,
  type Event,
} from '../../models';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import type { CreateEventInput, UpdateEventInput } from './event.schema';
import {
  buildDaftarHadirDocx,
  buildKartuPesertaDocx,
  buildNomorMejaDocx,
} from './event-documents';
import {
  buildDaftarHadirPdf,
  buildKartuPesertaPdf,
  buildNomorMejaPdf,
} from './event-pdf';
import type { EventStudent } from './event-pdf';

export interface EventExamSummary {
  id: number;
  title: string;
  classNames: string;
  startAt: Date | null;
  durationMinutes: number;
  isPublished: boolean;
}

async function findOrFail(id: number): Promise<Event> {
  const event = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!event) {
    throw ApiError.notFound('Event tidak ditemukan');
  }
  return event;
}

function ensureCanManage(event: Event, actor: AuthUser): void {
  if (actor.role !== 'admin' && event.createdBy !== actor.id) {
    throw ApiError.forbidden('Anda tidak memiliki akses ke event ini');
  }
}

async function replaceExamIds(eventId: number, examIds: number[]): Promise<void> {
  await db.delete(eventExams).where(eq(eventExams.eventId, eventId));
  const unique = [...new Set(examIds)];
  if (unique.length > 0) {
    // Validasi ujian ada
    const found = await db.select({ id: exams.id }).from(exams).where(inArray(exams.id, unique));
    if (found.length !== unique.length) {
      throw ApiError.badRequest('Beberapa ujian tidak ditemukan');
    }
    await db
      .insert(eventExams)
      .values(unique.map((examId) => ({ eventId, examId })))
      .onConflictDoNothing();
  }
}

async function getEventExams(eventId: number): Promise<EventExamSummary[]> {
  const rows = await db
    .select({
      id: exams.id,
      title: exams.title,
      startAt: exams.startAt,
      durationMinutes: exams.durationMinutes,
      isPublished: exams.isPublished,
    })
    .from(eventExams)
    .innerJoin(exams, eq(exams.id, eventExams.examId))
    .where(eq(eventExams.eventId, eventId))
    .orderBy(asc(exams.startAt), asc(exams.id));

  const classMap = new Map<number, string[]>();
  if (rows.length > 0) {
    const classRows = await db
      .select({ examId: examClasses.examId, name: classes.name })
      .from(examClasses)
      .innerJoin(classes, eq(classes.id, examClasses.classId))
      .where(inArray(examClasses.examId, rows.map((r) => r.id)));
    for (const row of classRows) {
      const list = classMap.get(row.examId) ?? [];
      list.push(row.name);
      classMap.set(row.examId, list);
    }
  }

  return rows.map((r) => ({
    ...r,
    classNames: (classMap.get(r.id) ?? []).join(', ') || '-',
  }));
}

/** Kelas yang menjadi peserta minimal satu ujian dalam event */
async function getEventClassIds(eventId: number): Promise<number[]> {
  const examIds = await db
    .select({ examId: eventExams.examId })
    .from(eventExams)
    .where(eq(eventExams.eventId, eventId));
  if (examIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ classId: examClasses.classId })
    .from(examClasses)
    .where(inArray(examClasses.examId, examIds.map((r) => r.examId)));
  return rows.map((r) => r.classId).sort((a, b) => a - b);
}

/** Pad nomor absen jadi 3 digit: 1 → "001" */
function padAbsen(n: number): string {
  return String(n).padStart(3, '0');
}

async function getClassStudents(classId: number, eventTitle: string): Promise<EventStudent[]> {
  const rows = await db
    .select({
      name: users.name,
      nis: users.nis,
      nisn: users.nisn,
      className: classes.name,
      initialPassword: users.initialPassword,
    })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.studentId))
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(eq(classMembers.classId, classId))
    .orderBy(asc(users.name));

  return rows.map((r, i) => {
    const absen = i + 1;
    const className = r.className;
    return {
      ...r,
      absen,
      seat: absen, // backward compat for DOCX
      identifier: `${eventTitle}/${className}/${padAbsen(absen)}`,
    };
  });
}

async function getEventAndClass(eventId: number, classId: number, actor: AuthUser) {
  const event = await findOrFail(eventId);
  ensureCanManage(event, actor);
  const kelas = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!kelas) {
    throw ApiError.notFound('Kelas tidak ditemukan');
  }
  const students = await getClassStudents(classId, event.title);
  if (students.length === 0) {
    throw ApiError.badRequest(`Kelas "${kelas.name}" belum memiliki siswa`);
  }
  const examList = await getEventExams(eventId);
  if (examList.length === 0) {
    throw ApiError.badRequest('Event belum memiliki ujian');
  }
  return { event, kelas, students, examList };
}

export const eventService = {
  async list(actor: AuthUser): Promise<(Event & { examCount: number })[]> {
    const rows = await db
      .select()
      .from(events)
      .where(actor.role === 'guru' ? eq(events.createdBy, actor.id) : undefined)
      .orderBy(desc(events.createdAt));

    const counts = rows.length
      ? await db
          .select({ eventId: eventExams.eventId, examId: eventExams.examId })
          .from(eventExams)
          .where(inArray(eventExams.eventId, rows.map((r) => r.id)))
      : [];
    const countMap = new Map<number, number>();
    for (const c of counts) {
      countMap.set(c.eventId, (countMap.get(c.eventId) ?? 0) + 1);
    }

    return rows.map((r) => ({ ...r, examCount: countMap.get(r.id) ?? 0 }));
  },

  async getById(id: number, actor: AuthUser) {
    const event = await findOrFail(id);
    ensureCanManage(event, actor);
    const [examList, classIds] = await Promise.all([
      getEventExams(id),
      getEventClassIds(id),
    ]);
    return { ...event, exams: examList, classIds };
  },

  async create(input: CreateEventInput, actor: AuthUser): Promise<Event> {
    // Validasi ujian lebih dulu agar tidak ada event "yatim" bila ada id yang salah
    const unique = [...new Set(input.examIds)];
    if (unique.length > 0) {
      const found = await db.select({ id: exams.id }).from(exams).where(inArray(exams.id, unique));
      if (found.length !== unique.length) {
        throw ApiError.badRequest('Beberapa ujian tidak ditemukan');
      }
    }

    return db.transaction(async (tx) => {
      const [event] = await tx
        .insert(events)
        .values({
          title: input.title,
          schoolName: input.schoolName,
          schoolAddress: input.schoolAddress ?? null,
          academicYear: input.academicYear ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          description: input.description ?? null,
          signerName: input.signerName ?? null,
          signerTitle: input.signerTitle ?? null,
          signerNip: input.signerNip ?? null,
          createdBy: actor.id,
        })
        .returning();

      if (unique.length > 0) {
        await tx
          .insert(eventExams)
          .values(unique.map((examId) => ({ eventId: event.id, examId })));
      }
      return event;
    });
  },

  async update(id: number, input: UpdateEventInput, actor: AuthUser): Promise<Event> {
    const event = await findOrFail(id);
    ensureCanManage(event, actor);

    const [updated] = await db
      .update(events)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();

    if (input.examIds) {
      await replaceExamIds(id, input.examIds);
    }
    return updated;
  },

  async remove(id: number, actor: AuthUser): Promise<void> {
    const event = await findOrFail(id);
    ensureCanManage(event, actor);
    await db.delete(events).where(eq(events.id, id));
  },

  /** Simpan logo kop (png/jpeg maks 1MB) sebagai data URL base64 */
  async setLogo(id: number, buffer: Buffer, mimeType: string, actor: AuthUser): Promise<Event> {
    const event = await findOrFail(id);
    ensureCanManage(event, actor);

    const allowed = ['image/png', 'image/jpeg'];
    if (!allowed.includes(mimeType)) {
      throw ApiError.badRequest('Logo harus berformat PNG atau JPG');
    }
    if (buffer.length > 1024 * 1024) {
      throw ApiError.badRequest('Ukuran logo maksimal 1MB');
    }

    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const [updated] = await db
      .update(events)
      .set({ logo: dataUrl, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return updated;
  },

  async removeLogo(id: number, actor: AuthUser): Promise<Event> {
    const event = await findOrFail(id);
    ensureCanManage(event, actor);
    const [updated] = await db
      .update(events)
      .set({ logo: null, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    return updated;
  },

  // ===== Dokumen cetak =====

  async kartuPeserta(
    eventId: number,
    classId: number | undefined,
    format: 'pdf' | 'docx',
    actor: AuthUser,
  ): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const event = await findOrFail(eventId);
    ensureCanManage(event, actor);

    // Tanpa classId → gabungan semua kelas peserta event
    const classIds = classId ? [classId] : await getEventClassIds(eventId);
    if (classIds.length === 0) {
      throw ApiError.badRequest('Event belum memiliki kelas peserta. Tambahkan ujian dengan kelas terlebih dahulu');
    }

    const examList = await getEventExams(eventId);
    if (examList.length === 0) {
      throw ApiError.badRequest('Event belum memiliki ujian');
    }

    const sections = [];
    for (const cid of classIds) {
      const kelas = await db.query.classes.findFirst({ where: eq(classes.id, cid) });
      if (!kelas) continue;
      const students = await getClassStudents(cid, event.title);
      if (students.length === 0) continue;
      sections.push({ kelas, students });
    }
    if (sections.length === 0) {
      throw ApiError.badRequest('Tidak ada siswa pada kelas peserta event ini');
    }

    const suffix = classId ? `-kelas-${sections[0].kelas.name.replace(/\s+/g, '-')}` : '-semua-kelas';

    if (format === 'pdf') {
      const buffer = await buildKartuPesertaPdf(event, examList, sections);
      return {
        filename: `kartu-peserta-${event.title.replace(/\s+/g, '-')}${suffix}.pdf`,
        buffer,
        contentType: 'application/pdf',
      };
    } else {
      // DOCX legacy — harus convert EventStudent ke format lama (seat: number)
      const legacySections = sections.map((s) => ({
        kelas: s.kelas,
        students: s.students.map((st) => ({
          name: st.name,
          nis: st.nis,
          nisn: st.nisn,
          className: st.className,
          seat: st.absen,
        })),
      }));
      const buffer = await buildKartuPesertaDocx(event, examList, legacySections);
      return {
        filename: `kartu-peserta-${event.title.replace(/\s+/g, '-')}${suffix}.docx`,
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
  },

  async daftarHadir(
    eventId: number,
    classId: number,
    format: 'pdf' | 'docx',
    actor: AuthUser,
  ): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const { event, kelas, students, examList } = await getEventAndClass(eventId, classId, actor);

    if (format === 'pdf') {
      const buffer = await buildDaftarHadirPdf(event, kelas, students, examList);
      return {
        filename: `daftar-hadir-${kelas.name.replace(/\s+/g, '-')}-${event.title.replace(/\s+/g, '-')}.pdf`,
        buffer,
        contentType: 'application/pdf',
      };
    } else {
      const legacyStudents = students.map((st) => ({
        name: st.name,
        nis: st.nis,
        nisn: st.nisn,
        className: st.className,
        seat: st.absen,
      }));
      const buffer = await buildDaftarHadirDocx(event, kelas, legacyStudents, examList);
      return {
        filename: `daftar-hadir-${kelas.name.replace(/\s+/g, '-')}-${event.title.replace(/\s+/g, '-')}.docx`,
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
  },

  async nomorMeja(
    eventId: number,
    classId: number,
    format: 'pdf' | 'docx',
    actor: AuthUser,
  ): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const { event, kelas, students } = await getEventAndClass(eventId, classId, actor);

    if (format === 'pdf') {
      const buffer = await buildNomorMejaPdf(event, kelas, students);
      return {
        filename: `nomor-meja-${kelas.name.replace(/\s+/g, '-')}-${event.title.replace(/\s+/g, '-')}.pdf`,
        buffer,
        contentType: 'application/pdf',
      };
    } else {
      const legacyStudents = students.map((st) => ({
        name: st.name,
        nis: st.nis,
        nisn: st.nisn,
        className: st.className,
        seat: st.absen,
      }));
      const buffer = await buildNomorMejaDocx(event, kelas, legacyStudents);
      return {
        filename: `nomor-meja-${kelas.name.replace(/\s+/g, '-')}-${event.title.replace(/\s+/g, '-')}.docx`,
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
  },

  // Dipakai FE untuk daftar kelas peserta di pemilih dokumen
  async eventClasses(eventId: number, actor: AuthUser): Promise<number[]> {
    const event = await findOrFail(eventId);
    ensureCanManage(event, actor);
    return getEventClassIds(eventId);
  },

};
