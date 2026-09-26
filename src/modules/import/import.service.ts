import bcrypt from 'bcryptjs';
import { asc, eq, ilike } from 'drizzle-orm';
import { db } from '../../config/db';
import { classMembers, classes, users, type UserRole } from '../../models';
import { readSheetRows, type SheetRow } from '../../utils/excel';
import { ApiError } from '../../utils/apiError';
import type { AuthUser } from '../../middleware/auth.middleware';
import { bankService } from '../bank/bank.service';
import type { CreateQuestionInput } from '../bank/bank.schema';
import { parseQuestionDocx } from './question-parser';

const BCRYPT_ROUNDS = 10;

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: ImportRowError[];
  classesCreated?: number;
  /** Untuk import anggota kelas: siswa lama yang baru digabung ke kelas */
  linked?: number;
}

const ROLE_VALUES: UserRole[] = ['admin', 'guru', 'siswa'];
const NISN_PATTERN = /^\d{4,20}$/;
const DEFAULT_STUDENT_PASSWORD = 'password123';

/** Ambil nilai kolom dengan beberapa kemungkinan nama header */
function pick(row: SheetRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== '') return value.trim();
  }
  return '';
}

/** Cari kelas berdasarkan nama (tanpa membedakan huruf besar/kecil); buat bila belum ada */
async function resolveClass(
  name: string,
  grade: string,
  jurusan: string,
  creatorId: number,
): Promise<{ id: number; created: boolean }> {
  const existing = await db.query.classes.findFirst({
    where: ilike(classes.name, name),
  });
  if (existing) return { id: existing.id, created: false };

  const [kelas] = await db
    .insert(classes)
    .values({ name, grade: grade || 'Umum', jurusan: jurusan || 'Umum', createdBy: creatorId })
    .returning({ id: classes.id });
  return { id: kelas.id, created: true };
}

// ===== Import Akun (halaman Pengguna) =====

export async function importUsers(
  buffer: Buffer,
  actorId: number,
): Promise<ImportSummary & { classesCreated: number }> {
  const rows = await readSheetRows(buffer);
  const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };
  let classesCreated = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2; // +2: header di baris 1, array mulai dari 0
    const name = pick(rows[i], ['nama', 'name']);
    const nis = pick(rows[i], ['nis']).replace(/\D/g, '');
    const nisn = pick(rows[i], ['nisn', 'no nisn']).replace(/\D/g, '');
    let email = pick(rows[i], ['email']).toLowerCase();
    const password = pick(rows[i], ['password', 'sandi']);
    const roleRaw = pick(rows[i], ['role', 'peran']).toLowerCase();
    const className = pick(rows[i], ['kelas', 'class']);
    const grade = pick(rows[i], ['jenjang', 'grade']);
    const jurusan = pick(rows[i], ['jurusan', 'major']);

    if (!name || !password) {
      summary.errors.push({ row: rowNumber, message: 'nama dan password wajib diisi' });
      continue;
    }
    if (password.length < 8) {
      summary.errors.push({ row: rowNumber, message: 'password minimal 8 karakter' });
      continue;
    }
    const role: UserRole = (ROLE_VALUES as string[]).includes(roleRaw)
      ? (roleRaw as UserRole)
      : 'siswa';

    // Siswa wajib punya NISN (identitas login); NIS sekolah opsional; email opsional (otomatis)
    if (role === 'siswa') {
      if (!nisn) {
        summary.errors.push({ row: rowNumber, message: 'NISN wajib diisi untuk akun siswa' });
        continue;
      }
      if (!NISN_PATTERN.test(nisn)) {
        summary.errors.push({
          row: rowNumber,
          message: `NISN "${nisn}" harus 4-20 digit angka`,
        });
        continue;
      }
      if (!email) email = `${nisn}@siswa.cbt.local`;
    } else if (!email) {
      summary.errors.push({
        row: rowNumber,
        message: 'email wajib diisi untuk akun guru/admin',
      });
      continue;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      summary.errors.push({ row: rowNumber, message: `email "${email}" tidak valid` });
      continue;
    }

    const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existingByEmail) {
      summary.skipped += 1;
      summary.errors.push({
        row: rowNumber,
        message: `email "${email}" sudah terdaftar (dilewati)`,
      });
      continue;
    }

    if (nisn) {
      const existingByNisn = await db.query.users.findFirst({ where: eq(users.nisn, nisn) });
      if (existingByNisn) {
        summary.skipped += 1;
        summary.errors.push({
          row: rowNumber,
          message: `NISN "${nisn}" sudah terdaftar (dilewati)`,
        });
        continue;
      }
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [user] = await db
      .insert(users)
      .values({ name, email, nis: nis || null, nisn: nisn || null, password: hashed, initialPassword: password, role })
      .returning({ id: users.id });
    summary.created += 1;

    // Opsional: masukkan ke kelas (dibuat otomatis bila belum ada) — khusus akun siswa
    if (className && role === 'siswa') {
      const kelas = await resolveClass(className, grade, jurusan, actorId);
      if (kelas.created) classesCreated += 1;
      await db
        .insert(classMembers)
        .values({ classId: kelas.id, studentId: user.id })
        .onConflictDoNothing();
    }
  }

  return { ...summary, classesCreated };
}

// ===== Import Siswa per Kelas (modal Kelola Siswa) =====

export async function importClassStudents(
  classId: number,
  buffer: Buffer,
): Promise<ImportSummary> {
  const kelas = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!kelas) throw ApiError.notFound('Kelas tidak ditemukan');

  const rows = await readSheetRows(buffer);
  const summary: ImportSummary = { created: 0, skipped: 0, linked: 0, errors: [] };
  let linked = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const name = pick(rows[i], ['nama', 'name']);
    const nis = pick(rows[i], ['nis']).replace(/\D/g, '');
    const nisn = pick(rows[i], ['nisn']).replace(/\D/g, '');
    const password = pick(rows[i], ['password', 'sandi']) || DEFAULT_STUDENT_PASSWORD;

    if (!name) {
      summary.errors.push({ row: rowNumber, message: 'nama wajib diisi' });
      continue;
    }
    if (!nisn && !nis) {
      summary.errors.push({
        row: rowNumber,
        message: 'isi NISN (utama) atau NIS sebagai identitas siswa',
      });
      continue;
    }
    if (nisn && !NISN_PATTERN.test(nisn)) {
      summary.errors.push({ row: rowNumber, message: `NISN "${nisn}" harus 4-20 digit angka` });
      continue;
    }
    if (password.length < 8) {
      summary.errors.push({ row: rowNumber, message: 'password minimal 8 karakter' });
      continue;
    }

    // Cari siswa yang sudah ada: prioritaskan NISN, lalu NIS
    let student: { id: number } | undefined = nisn
      ? await db.query.users.findFirst({ where: eq(users.nisn, nisn) })
      : undefined;
    if (!student && nis) {
      const byNis = await db.query.users.findFirst({ where: eq(users.nis, nis) });
      student = byNis ? { id: byNis.id } : undefined;
    }

    if (!student) {
      // Buat akun siswa baru; email otomatis dari NISN/NIS
      const email = `${nisn || nis}@siswa.cbt.local`;
      if (await db.query.users.findFirst({ where: eq(users.email, email) })) {
        summary.skipped += 1;
        summary.errors.push({
          row: rowNumber,
          message: `akun dengan email "${email}" sudah ada (dilewati)`,
        });
        continue;
      }
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const [created] = await db
        .insert(users)
        .values({ name, email, nis: nis || null, nisn: nisn || null, password: hashed, initialPassword: password, role: 'siswa' })
        .returning({ id: users.id });
      student = { id: created.id };
      summary.created += 1;
    }

    const inserted = await db
      .insert(classMembers)
      .values({ classId, studentId: student.id })
      .onConflictDoNothing()
      .returning({ id: classMembers.id });

    if (inserted.length > 0) linked += 1;
    else summary.skipped += 1;
  }

  summary.linked = linked;
  return summary;
}

// ===== Import Kelas =====

export async function importClasses(buffer: Buffer, actorId: number): Promise<ImportSummary> {
  const rows = await readSheetRows(buffer);
  const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const name = pick(rows[i], ['nama', 'name']);
    const grade = pick(rows[i], ['jenjang', 'grade']) || 'Umum';
    const jurusan = pick(rows[i], ['jurusan', 'major']) || 'Umum';
    const description = pick(rows[i], ['deskripsi', 'description']) || null;

    if (name.length < 2) {
      summary.errors.push({ row: rowNumber, message: 'nama kelas minimal 2 karakter' });
      continue;
    }

    const existing = await db.query.classes.findFirst({ where: ilike(classes.name, name) });
    if (existing) {
      summary.skipped += 1;
      summary.errors.push({ row: rowNumber, message: `kelas "${name}" sudah ada (dilewati)` });
      continue;
    }

    await db.insert(classes).values({ name, grade, jurusan, description, createdBy: actorId });
    summary.created += 1;
  }

  return summary;
}

// ===== Import Soal dari .docx ke Bank Soal =====

export async function importBankQuestionsDocx(
  bankId: number,
  buffer: Buffer,
  actor: AuthUser,
): Promise<ImportSummary> {
  // Sekaligus memvalidasi kepemilikan bank soal (throw bila bukan miliknya)
  await bankService.getById(bankId, actor);

  const { drafts, errors } = await parseQuestionDocx(buffer);
  const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };

  for (const err of errors) {
    summary.errors.push({ row: err.question, message: err.message });
  }

  for (const draft of drafts) {
    // Draft sudah divalidasi question-parser (bentuknya sama dengan schema soal)
    await bankService.createQuestion(bankId, draft as CreateQuestionInput, actor);
    summary.created += 1;
  }

  return summary;
}

// ===== Template =====

export async function bankQuestionsTemplate(): Promise<Buffer> {
  const { buildQuestionTemplateDocx } = await import('../../utils/docx');
  return buildQuestionTemplateDocx();
}

export async function usersTemplate(): Promise<Buffer> {
  const { buildTemplateBuffer } = await import('../../utils/excel');
  return buildTemplateBuffer(
    ['nama', 'nis', 'nisn', 'email', 'password', 'role', 'kelas', 'jenjang', 'jurusan'],
    [
      ['Ahmad Fauzi', '2024001', '0012345678', '', 'password123', 'siswa', 'VII A', 'VII', 'Umum'],
      ['Siti Aminah', '2024002', '0087654321', '', 'password123', 'siswa', 'VII A', 'VII', 'Umum'],
      ['Budi Guru', '', '', 'budi@sekolah.sch.id', 'password123', 'guru', '', '', ''],
      ['Petra Admin', '', '', 'petra@sekolah.sch.id', 'password123', 'admin', '', '', ''],
    ],
  );
}

export async function classStudentsTemplate(): Promise<Buffer> {
  const { buildTemplateBuffer } = await import('../../utils/excel');
  return buildTemplateBuffer(
    ['nama', 'nis', 'nisn', 'password'],
    [
      ['Ahmad Fauzi', '2024001', '0012345678', 'password123'],
      ['Siti Aminah', '2024002', '0087654321', 'password123'],
      ['Rudi Baru', '2024003', '', 'password123'],
    ],
  );
}

export async function classesTemplate(): Promise<Buffer> {
  const { buildTemplateBuffer } = await import('../../utils/excel');
  return buildTemplateBuffer(
    ['nama', 'jenjang', 'jurusan', 'deskripsi'],
    [
      ['VII A', 'VII', 'Umum', 'Kelas 7A tahun ajaran 2026/2027'],
      ['VII B', 'VII', 'Umum', ''],
      ['VIII A', 'VIII', 'Umum', ''],
    ],
  );
}

/** Daftar nilai unik jenjang yang sudah dipakai (untuk keperluan UI bila perlu) */
export async function listGrades(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ grade: classes.grade })
    .from(classes)
    .orderBy(asc(classes.grade));
  return rows.map((r) => r.grade);
}
