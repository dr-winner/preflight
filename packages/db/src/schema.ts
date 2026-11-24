import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Product tables from docs/SPEC.md §5.
 * `reports.public_id` is the unguessable id (UUIDv7 + 128-bit suffix). `reports.id` stays a uuid.
 */

export const checkTier = pgEnum("check_tier", ["passive", "deep"]);
export const checkRunStatus = pgEnum("check_run_status", ["queued", "running", "done", "error"]);
export const resultStatus = pgEnum("result_status", ["pass", "fail", "warn", "unknown"]);
export const funderKind = pgEnum("funder_kind", ["native", "erc20", "none"]);

export const humans = pgTable("humans", {
  nullifier: text("nullifier").primaryKey(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  freeUsed: integer("free_used").notNull().default(0),
  deepToday: integer("deep_today").notNull().default(0),
  deepDay: date("deep_day", { mode: "string" }),
});

export const selfAgents = pgTable(
  "self_agents",
  {
    chainId: integer("chain_id").notNull(),
    agentId: text("agent_id").notNull(),
    agentAddress: text("agent_address").notNull(),
    nullifier: text("nullifier")
      .notNull()
      .references(() => humans.nullifier),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.chainId, table.agentId] })],
);

export const selfSeenSigs = pgTable("self_seen_sigs", {
  signature: text("signature").primaryKey(),
  seenAt: timestamp("seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const checks = pgTable("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  network: text("network").notNull(),
  tier: checkTier("tier").notNull(),
  input: jsonb("input").notNull(),
  status: checkRunStatus("status").notNull(),
  payer: text("payer"),
  paymentTx: text("payment_tx"),
  free: boolean("free").notNull().default(false),
  selfAgentId: text("self_agent_id"),
  nullifier: text("nullifier"),
  /**
   * Nullable until the report row exists. The SQL migration adds the foreign key
   * after both tables are created; declaring it here would cycle the table types.
   */
  reportId: uuid("report_id"),
  error: text("error"),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  publicId: text("public_id").notNull().unique(),
  checkId: uuid("check_id")
    .notNull()
    .references(() => checks.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  network: text("network").notNull(),
  summary: jsonb("summary").notNull(),
  report: jsonb("report").notNull(),
  digest: text("digest").notNull(),
  signature: text("signature").notNull(),
  signer: text("signer").notNull(),
});

export const checkResults = pgTable(
  "check_results",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    track: text("track").notNull(),
    checkKey: text("check_key").notNull(),
    status: resultStatus("status").notNull(),
    evidence: jsonb("evidence").notNull(),
    hint: text("hint").notNull(),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.checkKey] })],
);

export const payments = pgTable("payments", {
  txHash: text("tx_hash").primaryKey(),
  network: text("network").notNull(),
  route: text("route").notNull(),
  payer: text("payer").notNull(),
  payTo: text("pay_to").notNull(),
  asset: text("asset").notNull(),
  amount: numeric("amount").notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const dataSpend = pgTable("data_spend", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  provider: text("provider").notNull(),
  url: text("url").notNull(),
  amount: numeric("amount").notNull(),
  asset: text("asset").notNull(),
  receipt: jsonb("receipt"),
  sessionKeyId: text("session_key_id"),
  status: text("status").notNull(),
});

export const funderCache = pgTable(
  "funder_cache",
  {
    network: text("network").notNull(),
    address: text("address").notNull(),
    funder: text("funder"),
    kind: funderKind("kind").notNull(),
    txHash: text("tx_hash"),
    block: bigint("block", { mode: "bigint" }),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.network, table.address] })],
);

export const tagCache = pgTable("tag_cache", {
  network: text("network").notNull(),
  txHash: text("tx_hash").primaryKey(),
  codes: text("codes").array(),
  schema: integer("schema"),
});

export const schema = {
  humans,
  selfAgents,
  selfSeenSigs,
  checks,
  reports,
  checkResults,
  payments,
  dataSpend,
  funderCache,
  tagCache,
};
