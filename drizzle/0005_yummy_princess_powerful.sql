ALTER TABLE "exams" DROP CONSTRAINT "exams_class_id_classes_id_fk";
--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN "class_id";