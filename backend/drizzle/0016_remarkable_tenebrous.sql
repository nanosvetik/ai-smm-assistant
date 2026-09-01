CREATE TABLE `generated_images` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`platform` text NOT NULL,
	`version` integer NOT NULL,
	`visual_prompt_version` integer NOT NULL,
	`model` text NOT NULL,
	`cost` real,
	`file_path` text NOT NULL,
	`public_url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
