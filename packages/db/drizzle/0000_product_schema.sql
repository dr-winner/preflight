CREATE TYPE "public"."check_run_status" AS ENUM('queued', 'running', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."check_tier" AS ENUM('passive', 'deep');--> statement-breakpoint
CREATE TYPE "public"."funder_kind" AS ENUM('native', 'erc20', 'none');--> statement-breakpoint
CREATE TYPE "public"."result_status" AS ENUM('pass', 'fail', 'warn', 'unknown');--> statement-breakpoint
CREATE TABLE "check_results" (
	"report_id" uuid NOT NULL,
	"track" text NOT NULL,
	"check_key" text NOT NULL,
	"status" "result_status" NOT NULL,
	"evidence" jsonb NOT NULL,
	"hint" text NOT NULL,
	CONSTRAINT "check_results_report_id_check_key_pk" PRIMARY KEY("report_id","check_key")
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"network" text NOT NULL,
	"tier" "check_tier" NOT NULL,
	"input" jsonb NOT NULL,
	"status" "check_run_status" NOT NULL,
	"payer" text,
	"payment_tx" text,
	"free" boolean DEFAULT false NOT NULL,
	"self_agent_id" text,
	"nullifier" text,
	"report_id" uuid,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "data_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"url" text NOT NULL,
	"amount" numeric NOT NULL,
	"asset" text NOT NULL,
	"receipt" jsonb,
	"session_key_id" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funder_cache" (
	"network" text NOT NULL,
	"address" text NOT NULL,
	"funder" text,
	"kind" "funder_kind" NOT NULL,
	"tx_hash" text,
	"block" bigint,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funder_cache_network_address_pk" PRIMARY KEY("network","address")
);
--> statement-breakpoint
CREATE TABLE "humans" (
	"nullifier" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"free_used" integer DEFAULT 0 NOT NULL,
	"deep_today" integer DEFAULT 0 NOT NULL,
	"deep_day" date
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"tx_hash" text PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"route" text NOT NULL,
	"payer" text NOT NULL,
	"pay_to" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric NOT NULL,
	"settled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"check_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"network" text NOT NULL,
	"summary" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"digest" text NOT NULL,
	"signature" text NOT NULL,
	"signer" text NOT NULL,
	CONSTRAINT "reports_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "self_agents" (
	"chain_id" integer NOT NULL,
	"agent_id" text NOT NULL,
	"agent_address" text NOT NULL,
	"nullifier" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "self_agents_chain_id_agent_id_pk" PRIMARY KEY("chain_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "self_seen_sigs" (
	"signature" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_cache" (
	"network" text NOT NULL,
	"tx_hash" text PRIMARY KEY NOT NULL,
	"codes" text[],
	"schema" integer
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "self_agents" ADD CONSTRAINT "self_agents_nullifier_humans_nullifier_fk" FOREIGN KEY ("nullifier") REFERENCES "public"."humans"("nullifier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;