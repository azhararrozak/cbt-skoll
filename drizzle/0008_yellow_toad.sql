ALTER TABLE "events" ADD COLUMN "signer_name" varchar(150);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "signer_title" varchar(150);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "signer_nip" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "initial_password" varchar(255);