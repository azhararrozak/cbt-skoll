import { index, integer, pgTable, serial, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { exams } from './exam.model';
import { timestamps, users } from './user.model';

/**
 * Event ujian: wadah beberapa ujian untuk satu kegiatan sekolah,
 * misalnya "Ujian Tengah Semester Ganjil". Menyimpan kop dokumen
 * (nama sekolah, alamat, logo) untuk cetak kartu peserta, daftar hadir,
 * dan nomor meja.
 */
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  // Kop dokumen
  schoolName: varchar('school_name', { length: 150 }).notNull(),
  schoolAddress: varchar('school_address', { length: 300 }),
  academicYear: varchar('academic_year', { length: 30 }),
  // Logo sekolah dalam data URL base64 (png/jpeg) untuk dicetak di kop
  logo: text('logo'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  description: text('description'),
  // Penanda tangan dokumen (kartu peserta, daftar hadir)
  signerName: varchar('signer_name', { length: 150 }),
  signerTitle: varchar('signer_title', { length: 150 }),
  signerNip: varchar('signer_nip', { length: 50 }),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ...timestamps,
});

/** Ujian yang diujikan dalam sebuah event */
export const eventExams = pgTable(
  'event_exams',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    examId: integer('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    unique('event_exams_event_exam_unique').on(table.eventId, table.examId),
    index('event_exams_exam_id_idx').on(table.examId),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventExam = typeof eventExams.$inferSelect;
