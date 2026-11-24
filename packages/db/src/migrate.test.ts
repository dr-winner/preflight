import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const withDatabase = databaseUrl === undefined ? describe.skip : describe;

describe("migration file", () => {
  it("creates the product tables and the checks report foreign key", () => {
    const sql = readFileSync(
      new URL("../drizzle/0000_product_schema.sql", import.meta.url),
      "utf8",
    );
    for (const table of [
      "humans",
      "self_agents",
      "self_seen_sigs",
      "checks",
      "reports",
      "check_results",
      "payments",
      "data_spend",
      "funder_cache",
      "tag_cache",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).toContain("checks_report_id_reports_id_fk");
    expect(sql).toContain("reports_public_id_unique");
  });
});

withDatabase("postgres", () => {
  it("applies the migration and accepts a check, report, and result", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle(pool);
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "humans",
        "self_agents",
        "self_seen_sigs",
        "checks",
        "reports",
        "check_results",
        "payments",
        "data_spend",
        "funder_cache",
        "tag_cache",
      ]),
    );

    const checkId = "00000000-0000-7000-8000-000000000010";
    const reportId = "00000000-0000-7000-8000-000000000011";
    await pool.query("DELETE FROM check_results WHERE report_id = $1", [reportId]);
    await pool.query("UPDATE checks SET report_id = NULL WHERE id = $1", [checkId]);
    await pool.query("DELETE FROM reports WHERE id = $1", [reportId]);
    await pool.query("DELETE FROM checks WHERE id = $1", [checkId]);

    await pool.query(
      `INSERT INTO checks (id, network, tier, input, status, free)
       VALUES ($1, 'mainnet', 'passive', '{}'::jsonb, 'done', false)`,
      [checkId],
    );
    await pool.query(
      `INSERT INTO reports (
         id, public_id, check_id, expires_at, network, summary, report, digest, signature, signer
       ) VALUES (
         $1, $2, $3, now() + interval '30 days', 'mainnet', '{}'::jsonb, '{}'::jsonb, '0xabc', '0xdef',
         '0x1111111111111111111111111111111111111111'
       )`,
      [reportId, `public-${reportId}`, checkId],
    );
    await pool.query("UPDATE checks SET report_id = $1 WHERE id = $2", [reportId, checkId]);
    await pool.query(
      `INSERT INTO check_results (report_id, track, check_key, status, evidence, hint)
       VALUES ($1, 'global', 'g7.x402.payto_registered', 'unknown', '{"observed":false}'::jsonb, 'Register PayTo')`,
      [reportId],
    );
    await pool.query(
      `INSERT INTO humans (nullifier) VALUES ('migrate-test')
       ON CONFLICT (nullifier) DO UPDATE SET free_used = 0`,
    );

    const linked = await pool.query<{ report_id: string; free_used: number }>(
      `SELECT checks.report_id, humans.free_used
       FROM checks, humans
       WHERE checks.id = $1 AND humans.nullifier = 'migrate-test'`,
      [checkId],
    );
    expect(linked.rows[0]?.report_id).toBe(reportId);
    expect(linked.rows[0]?.free_used).toBe(0);

    await pool.query("DELETE FROM check_results WHERE report_id = $1", [reportId]);
    await pool.query("UPDATE checks SET report_id = NULL WHERE id = $1", [checkId]);
    await pool.query("DELETE FROM reports WHERE id = $1", [reportId]);
    await pool.query("DELETE FROM checks WHERE id = $1", [checkId]);
    await pool.query("DELETE FROM humans WHERE nullifier = 'migrate-test'");
    await pool.end();
  });
});
