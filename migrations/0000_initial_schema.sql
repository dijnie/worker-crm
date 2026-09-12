CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`website` text,
	`description` text,
	`logo_url` text,
	`logo_dark_url` text,
	`icon_url` text,
	`icon_dark_url` text,
	`icon_tone` text,
	`brand_color` text,
	`industry` text,
	`sub_industry` text,
	`city` text,
	`state_code` text,
	`country` text,
	`country_code` text,
	`phone` text,
	`email` text,
	`linkedin_url` text,
	`twitter_url` text,
	`github_url` text,
	`pricing_url` text,
	`careers_url` text,
	`owner_id` text,
	`primary_contact_id` text,
	`enrichment_status` text DEFAULT 'PENDING' NOT NULL,
	`enriched_at` text,
	`enrichment_error` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`last_activity_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`primary_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_primary_contact_id_unique` ON `companies` (`primary_contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_domain_unique` ON `companies` (`domain`) WHERE "companies"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX `companies_owner_id_idx` ON `companies` (`owner_id`);--> statement-breakpoint
CREATE INDEX `companies_name_idx` ON `companies` (`name`);--> statement-breakpoint
CREATE INDEX `companies_last_activity_at_idx` ON `companies` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `companies_archived_at_idx` ON `companies` (`archived_at`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text,
	`phone` text,
	`title` text,
	`seniority` text,
	`function` text,
	`linkedin_url` text,
	`twitter_url` text,
	`github_url` text,
	`image_url` text,
	`socials_checked_at` text,
	`enrichment_status` text DEFAULT 'PENDING' NOT NULL,
	`enriched_at` text,
	`enrichment_error` text,
	`company_id` text,
	`owner_id` text,
	`source` text DEFAULT 'MANUAL' NOT NULL,
	`last_activity_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`) WHERE "contacts"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX `contacts_company_id_idx` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE INDEX `contacts_owner_id_idx` ON `contacts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `contacts_last_activity_at_idx` ON `contacts` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `contacts_archived_at_idx` ON `contacts` (`archived_at`);--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`company_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`stage` text DEFAULT 'DEMO_BOOKED' NOT NULL,
	`stage_changed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`amount` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`expected_close_date` text,
	`closed_at` text,
	`closed_reason` text,
	`base_amount` text,
	`base_currency` text,
	`fx_rate` text,
	`fx_rate_at` text,
	`last_activity_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deals_company_id_idx` ON `deals` (`company_id`);--> statement-breakpoint
CREATE INDEX `deals_owner_id_idx` ON `deals` (`owner_id`);--> statement-breakpoint
CREATE INDEX `deals_stage_idx` ON `deals` (`stage`);--> statement-breakpoint
CREATE INDEX `deals_expected_close_date_idx` ON `deals` (`expected_close_date`);--> statement-breakpoint
CREATE INDEX `deals_last_activity_at_idx` ON `deals` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `deals_base_amount_idx` ON `deals` (`base_amount`);--> statement-breakpoint
CREATE INDEX `deals_currency_idx` ON `deals` (`currency`);--> statement-breakpoint
CREATE INDEX `deals_archived_at_idx` ON `deals` (`archived_at`);--> statement-breakpoint
CREATE TABLE `deal_contacts` (
	`deal_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text,
	PRIMARY KEY(`deal_id`, `contact_id`),
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deal_contacts_contact_id_idx` ON `deal_contacts` (`contact_id`);--> statement-breakpoint
CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`subject` text,
	`body` text,
	`occurred_at` text,
	`due_at` text,
	`completed_at` text,
	`company_id` text,
	`contact_id` text,
	`deal_id` text,
	`created_by_id` text NOT NULL,
	`meta` text,
	`email_thread_id` text,
	`calendar_event_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_email_thread_id_unique` ON `activities` (`email_thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activities_calendar_event_id_unique` ON `activities` (`calendar_event_id`);--> statement-breakpoint
CREATE INDEX `activities_company_id_created_at_idx` ON `activities` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_deal_id_created_at_idx` ON `activities` (`deal_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_contact_id_created_at_idx` ON `activities` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activities_due_at_idx` ON `activities` (`due_at`);--> statement-breakpoint
CREATE INDEX `activities_created_by_id_idx` ON `activities` (`created_by_id`);--> statement-breakpoint
CREATE TABLE `field_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`agent_filled` integer DEFAULT true NOT NULL,
	`agent_brief` text,
	`required` integer DEFAULT false NOT NULL,
	`show_on_sheet` integer DEFAULT true NOT NULL,
	`show_on_table` integer DEFAULT false NOT NULL,
	`show_on_filter` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_definitions_entity_key_unique` ON `field_definitions` (`entity`,`key`);--> statement-breakpoint
CREATE INDEX `field_definitions_entity_position_idx` ON `field_definitions` (`entity`,`position`);--> statement-breakpoint
CREATE TABLE `field_options` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`label` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`field_id`) REFERENCES `field_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `field_options_field_id_position_idx` ON `field_options` (`field_id`,`position`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`company_id` text,
	`contact_id` text,
	`deal_id` text,
	`text` text,
	`number` text,
	`date` text,
	`bool` integer,
	`option_id` text,
	`user_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `field_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `field_options`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `field_values_field_id_company_id_unique` ON `field_values` (`field_id`,`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `field_values_field_id_contact_id_unique` ON `field_values` (`field_id`,`contact_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `field_values_field_id_deal_id_unique` ON `field_values` (`field_id`,`deal_id`);--> statement-breakpoint
CREATE INDEX `field_values_field_id_text_idx` ON `field_values` (`field_id`,`text`);--> statement-breakpoint
CREATE INDEX `field_values_field_id_number_idx` ON `field_values` (`field_id`,`number`);--> statement-breakpoint
CREATE INDEX `field_values_field_id_date_idx` ON `field_values` (`field_id`,`date`);--> statement-breakpoint
CREATE INDEX `field_values_company_id_idx` ON `field_values` (`company_id`);--> statement-breakpoint
CREATE INDEX `field_values_contact_id_idx` ON `field_values` (`contact_id`);--> statement-breakpoint
CREATE INDEX `field_values_deal_id_idx` ON `field_values` (`deal_id`);--> statement-breakpoint
CREATE INDEX `field_values_option_id_idx` ON `field_values` (`option_id`);--> statement-breakpoint
CREATE INDEX `field_values_user_id_idx` ON `field_values` (`user_id`);--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`name` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`filters` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_views_entity_owner_id_name_unique` ON `saved_views` (`entity`,`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `saved_views_entity_shared_idx` ON `saved_views` (`entity`,`shared`);