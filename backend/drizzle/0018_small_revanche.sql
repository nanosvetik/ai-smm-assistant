CREATE TABLE `reels_reference_files` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`file_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
