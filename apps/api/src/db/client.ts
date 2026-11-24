import { schema } from "@preflight/db";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type Database = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}
