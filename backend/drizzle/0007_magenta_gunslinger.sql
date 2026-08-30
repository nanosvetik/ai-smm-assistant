CREATE TABLE `content_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`packaging_profile_version` integer NOT NULL,
	`competitor_analysis_profile_version` integer NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
