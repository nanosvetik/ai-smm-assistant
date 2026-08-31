CREATE TABLE `editorial_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`content_type` text NOT NULL,
	`platform` text NOT NULL,
	`version` integer NOT NULL,
	`reviewed_content_version` integer NOT NULL,
	`verdict` text NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reels_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`used_references` integer NOT NULL,
	`reference_categories` text NOT NULL,
	`content_plan_version` integer NOT NULL,
	`packaging_profile_version` integer NOT NULL,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
