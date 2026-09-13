CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`access_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `singleton_membership` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`access_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "singleton_membership_role_check" CHECK("singleton_membership"."role" in ('owner', 'member')),
	CONSTRAINT "singleton_membership_status_check" CHECK("singleton_membership"."status" in ('active', 'revoked')),
	CONSTRAINT "singleton_membership_revision_check" CHECK("singleton_membership"."revision" >= 0),
	CONSTRAINT "singleton_membership_access_version_check" CHECK("singleton_membership"."access_version" >= 0)
);
--> statement-breakpoint
CREATE INDEX `singleton_membership_status_idx` ON `singleton_membership` (`status`);--> statement-breakpoint
CREATE TABLE `singleton_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "singleton_workspace_id_check" CHECK("singleton_workspace"."id" = 'shared')
);
--> statement-breakpoint
INSERT INTO singleton_workspace (id, owner_user_id, created_at, updated_at)
VALUES ('shared', NULL, cast(unixepoch('subsecond') * 1000 as integer), cast(unixepoch('subsecond') * 1000 as integer));
--> statement-breakpoint
CREATE TRIGGER singleton_owner_claim_immutable BEFORE UPDATE OF owner_user_id ON singleton_workspace
WHEN OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NOT OLD.owner_user_id
BEGIN SELECT RAISE(ABORT, 'singleton_owner_claim_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER singleton_owner_claim_verified BEFORE UPDATE OF owner_user_id ON singleton_workspace
WHEN NEW.owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.owner_user_id AND email_verified = 1)
BEGIN SELECT RAISE(ABORT, 'singleton_owner_claim_requires_verification'); END;
--> statement-breakpoint
CREATE TRIGGER singleton_workspace_retained BEFORE DELETE ON singleton_workspace
BEGIN SELECT RAISE(ABORT, 'singleton_workspace_retained'); END;
--> statement-breakpoint
CREATE TRIGGER membership_verified_admission BEFORE INSERT ON singleton_membership
WHEN NOT EXISTS (SELECT 1 FROM user WHERE id = NEW.user_id AND email_verified = 1)
  OR (NEW.role = 'owner' AND NOT EXISTS (SELECT 1 FROM singleton_workspace WHERE id = 'shared' AND owner_user_id = NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'membership_admission_denied'); END;
--> statement-breakpoint
CREATE TRIGGER membership_last_owner_update BEFORE UPDATE OF role, status ON singleton_membership
WHEN OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active')
  AND NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id <> OLD.user_id AND role = 'owner' AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'last_active_owner'); END;
--> statement-breakpoint
CREATE TRIGGER membership_last_owner_delete BEFORE DELETE ON singleton_membership
WHEN OLD.role = 'owner' AND OLD.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id <> OLD.user_id AND role = 'owner' AND status = 'active')
BEGIN SELECT RAISE(ABORT, 'last_active_owner'); END;
--> statement-breakpoint
CREATE TRIGGER auth_session_access_insert BEFORE INSERT ON session
WHEN NOT EXISTS (
  SELECT 1 FROM singleton_membership m JOIN user u ON u.id = m.user_id
  WHERE m.user_id = NEW.user_id AND u.email_verified = 1 AND m.status = 'active' AND m.access_version = NEW.access_version
)
BEGIN SELECT RAISE(ABORT, 'auth_session_access_denied'); END;
--> statement-breakpoint
CREATE TRIGGER auth_session_access_update BEFORE UPDATE ON session
WHEN NOT EXISTS (
  SELECT 1 FROM singleton_membership m JOIN user u ON u.id = m.user_id
  WHERE m.user_id = NEW.user_id AND u.email_verified = 1 AND m.status = 'active' AND m.access_version = NEW.access_version
)
BEGIN SELECT RAISE(ABORT, 'auth_session_access_denied'); END;
