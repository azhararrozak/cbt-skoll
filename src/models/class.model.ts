import { index, integer, pgTable, serial, text, unique, varchar } from 'drizzle-orm/pg-core';
import { timestamps, users } from './user.model';

export const classes = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 150 }).notNull(),
  description: text('description'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const classMembers = pgTable(
  'class_members',
  {
    id: serial('id').primaryKey(),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentId: integer('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    unique('class_members_class_student_unique').on(table.classId, table.studentId),
    index('class_members_student_id_idx').on(table.studentId),
  ],
);

export type Kelas = typeof classes.$inferSelect;
export type NewKelas = typeof classes.$inferInsert;
export type ClassMember = typeof classMembers.$inferSelect;
export type NewClassMember = typeof classMembers.$inferInsert;
