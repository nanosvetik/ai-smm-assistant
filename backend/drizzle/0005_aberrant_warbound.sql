CREATE TABLE `competitor_analysis_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`competitors_analyzed` integer NOT NULL,
	`posts_analyzed` integer NOT NULL,
	`platforms` text NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
