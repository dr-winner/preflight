import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === "") {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  schema: "../../packages/db/src/schema.ts",
  out: "../../packages/db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
