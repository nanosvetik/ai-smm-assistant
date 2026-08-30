CREATE TABLE `audience_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`b2b` integer DEFAULT false NOT NULL,
	`niche_width` text,
	`segments` text,
	`validation_after` text,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
