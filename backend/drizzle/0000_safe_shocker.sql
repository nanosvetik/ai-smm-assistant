CREATE TABLE `access_links` (
	`token` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`kind` text NOT NULL,
	`used_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_type` text NOT NULL,
	`contact_value` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`client_id` text,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_type` text NOT NULL,
	`contact_value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
