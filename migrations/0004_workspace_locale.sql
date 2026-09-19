PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_singleton_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`reporting_currency` text DEFAULT 'USD' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "singleton_workspace_id_check" CHECK("__new_singleton_workspace"."id" = 'shared'),
	CONSTRAINT "singleton_workspace_currency_check" CHECK(length("__new_singleton_workspace"."reporting_currency") = 3 and "__new_singleton_workspace"."reporting_currency" = upper("__new_singleton_workspace"."reporting_currency")),
	CONSTRAINT "singleton_workspace_locale_check" CHECK("__new_singleton_workspace"."locale" in ('en', 'vi')),
	CONSTRAINT "singleton_workspace_revision_check" CHECK("__new_singleton_workspace"."revision" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_singleton_workspace`("id", "owner_user_id", "reporting_currency", "locale", "revision", "created_at", "updated_at") SELECT "id", "owner_user_id", "reporting_currency", 'en', "revision", "created_at", "updated_at" FROM `singleton_workspace`;--> statement-breakpoint
DROP TABLE `singleton_workspace`;--> statement-breakpoint
ALTER TABLE `__new_singleton_workspace` RENAME TO `singleton_workspace`;--> statement-breakpoint
--> statement-breakpoint
CREATE TRIGGER singleton_owner_claim_immutable BEFORE UPDATE OF owner_user_id ON singleton_workspace
WHEN OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NOT OLD.owner_user_id
BEGIN SELECT RAISE(ABORT, 'singleton_owner_claim_immutable'); END;--> statement-breakpoint
CREATE TRIGGER singleton_owner_claim_verified BEFORE UPDATE OF owner_user_id ON singleton_workspace
WHEN NEW.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.owner_user_id AND email_verified = 1)
BEGIN SELECT RAISE(ABORT, 'singleton_owner_claim_requires_verification'); END;--> statement-breakpoint
CREATE TRIGGER singleton_workspace_retained BEFORE DELETE ON singleton_workspace
BEGIN SELECT RAISE(ABORT, 'singleton_workspace_retained'); END;--> statement-breakpoint
PRAGMA foreign_keys=ON;