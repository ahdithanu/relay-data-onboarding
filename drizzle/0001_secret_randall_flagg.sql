CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`project_name` text NOT NULL,
	`manifest_key` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_backups_workspace` ON `backups` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`release_id` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text NOT NULL,
	`lease_token` text,
	`lease_until` text,
	`receipt` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_deliveries_workspace` ON `deliveries` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `destinations` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`claimed_by` text,
	`revoked_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_invitations_workspace` ON `invitations` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_members_workspace` ON `members` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`route` text NOT NULL,
	`method` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_requests_workspace_created` ON `requests` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_events_created` ON `workspace_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_email` text NOT NULL,
	`require_approval` integer DEFAULT 0 NOT NULL,
	`retention_days` integer DEFAULT 30 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `audit` ADD `evidence_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit` ADD `project_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `audit` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `deleted_at` text;