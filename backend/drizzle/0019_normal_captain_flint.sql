PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE `visual_generator_prompts`;
--> statement-breakpoint
CREATE TABLE `visual_generator_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`platform` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`copywriter_post_version` integer NOT NULL,
	`packaging_profile_version` integer NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
