CREATE TABLE `onboarding_profiles` (
	`client_id` text PRIMARY KEY NOT NULL,
	`sales_model` text NOT NULL,
	`client_description` text NOT NULL,
	`client_phrases` text,
	`main_principle` text NOT NULL,
	`content_taboos` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reference_files` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`category` text NOT NULL,
	`file_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `social_links` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`role` text NOT NULL,
	`platform` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
