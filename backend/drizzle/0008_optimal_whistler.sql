CREATE TABLE `copywriter_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`platform` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`day` integer NOT NULL,
	`content_plan_version` integer NOT NULL,
	`packaging_profile_version` integer NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
