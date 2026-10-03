import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../config/db';
import { classMembers, classes, exams, questionBanks, questions, users } from '../models';

const BCRYPT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'password123';

async function upsertUser(input: {
  name: string;
  email: string;
  role: 'admin' | 'guru' | 'siswa';
}) {
  const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (existing) {
    return existing;
  }
  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
  const [user] = await db
    .insert(users)
    .values({ ...input, password: hashed })
    .returning();
  return user;
}

async function seed(): Promise<void> {
  console.log('🌱 Menjalankan seed data demo CBT...');

  const [_admin, guru, siswa1, siswa2] = await Promise.all([
    upsertUser({ name: 'Admin', email: 'admin@cbt.test', role: 'admin' }),
    upsertUser({ name: 'Budi Guru', email: 'guru@cbt.test', role: 'guru' }),
    upsertUser({ name: 'Siswa Satu', email: 'siswa1@cbt.test', role: 'siswa' }),
    upsertUser({ name: 'Siswa Dua', email: 'siswa2@cbt.test', role: 'siswa' }),
  ]);

  const existingExam = await db.query.exams.findFirst();
  if (existingExam) {
    console.log('ℹ️  Data demo sudah ada, seed dilewati.');
    return;
  }

  const [kelas] = await db
    .insert(classes)
    .values({
      name: 'Kelas XI IPA 1',
      description: 'Kelas demo untuk ujian CBT',
      createdBy: guru.id,
    })
    .returning();

  await db
    .insert(classMembers)
    .values([
      { classId: kelas.id, studentId: siswa1.id },
      { classId: kelas.id, studentId: siswa2.id },
    ])
    .onConflictDoNothing();

  const [bank] = await db
    .insert(questionBanks)
    .values({
      name: 'Bank Soal Matematika Dasar',
      subject: 'Matematika',
      description: 'Kumpulan soal demo tiga tipe soal',
      createdBy: guru.id,
    })
    .returning();

  await db.insert(questions).values([
    {
      bankId: bank.id,
      type: 'multiple_choice',
      questionText: 'Ibu kota Provinsi Jawa Barat adalah ...',
      options: ['Bandung', 'Semarang', 'Surabaya', 'Serang'],
      correctAnswer: '0',
      points: 10,
    },
    {
      bankId: bank.id,
      type: 'multiple_choice',
      questionText: 'Hasil dari 12 x 8 adalah ...',
      options: ['86', '96', '106', '116'],
      correctAnswer: '1',
      points: 10,
    },
    {
      bankId: bank.id,
      type: 'true_false',
      questionText: 'Angka 0 termasuk bilangan prima.',
      options: ['Benar', 'Salah'],
      correctAnswer: '1',
      points: 10,
    },
    {
      bankId: bank.id,
      type: 'true_false',
      questionText: 'Air mendidih pada suhu 100 derajat Celcius di tekanan 1 atm.',
      options: ['Benar', 'Salah'],
      correctAnswer: '0',
      points: 10,
    },
    {
      bankId: bank.id,
      type: 'short_answer',
      questionText: 'Sebutkan nama hasil bagi dua bilangan!',
      correctAnswer: 'hasil bagi',
      points: 10,
    },
  ]);

  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [exam] = await db
    .insert(exams)
    .values({
      title: 'Ujian Matematika Dasar',
      description: 'Ujian demo CBT, kerjakan semua soal',
      bankId: bank.id,
      classId: kelas.id,
      token: 'UJIAN1',
      durationMinutes: 60,
      startAt,
      endAt,
      isPublished: true,
      createdBy: guru.id,
    })
    .returning();

  console.log('✅ Seed selesai. Akun demo (password: password123):');
  console.log(`   admin  : admin@cbt.test`);
  console.log(`   guru   : guru@cbt.test`);
  console.log(`   siswa  : siswa1@cbt.test, siswa2@cbt.test (kelas: ${kelas.name})`);
  console.log(`   ujian  : "${exam.title}" token: ${exam.token} (durasi ${exam.durationMinutes} menit)`);
}

seed()
  .catch((error) => {
    console.error('❌ Seed gagal:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
