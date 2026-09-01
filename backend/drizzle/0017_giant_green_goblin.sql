CREATE TABLE `generated_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`video_prompt_version` integer NOT NULL,
	`model` text NOT NULL,
	`cost` real,
	`file_path` text NOT NULL,
	`public_url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reels_video_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`used_visual_profile` integer NOT NULL,
	`reels_script_version` integer NOT NULL,
	`visual_style_profile_version` integer,
	`document_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
