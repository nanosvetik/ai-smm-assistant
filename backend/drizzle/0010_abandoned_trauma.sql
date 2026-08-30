CREATE TABLE `visual_generator_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`platform` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`used_visual_profile` integer NOT NULL,
	`copywriter_post_version` integer NOT NULL,
	`visual_style_profile_version` integer,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
