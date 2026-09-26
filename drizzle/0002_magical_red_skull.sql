ALTER TABLE "users" ADD COLUMN "nisn" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nisn_unique" UNIQUE("nisn");