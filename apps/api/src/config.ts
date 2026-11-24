import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]);
const celoNetworkSchema = z.enum(["sepolia", "mainnet"]);

const envSchema = z.object({
  NODE_ENV: nodeEnvSchema.optional(),
  PORT: z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional(),
  DATABASE_URL: z.string().min(1).optional(),
  CELO_NETWORK: celoNetworkSchema.optional(),
});

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
export type CeloNetwork = z.infer<typeof celoNetworkSchema>;

export type AppConfig = {
  nodeEnv: NodeEnv;
  port: number;
  databaseUrl: string | undefined;
  celoNetwork: CeloNetwork;
};

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return `${path === "" ? "env" : path}: ${issue.message}`;
    })
    .join("; ");
}

function readDatabaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid environment: DATABASE_URL: must be a postgresql URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Invalid environment: DATABASE_URL: must be a postgresql URL");
  }

  return value;
}

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return 3001;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid environment: PORT: must be an integer from 1 to 65535");
  }

  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse({
    NODE_ENV: blankToUndefined(env.NODE_ENV),
    PORT: blankToUndefined(env.PORT),
    DATABASE_URL: blankToUndefined(env.DATABASE_URL),
    CELO_NETWORK: blankToUndefined(env.CELO_NETWORK),
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${formatIssues(parsed.error)}`);
  }

  return {
    nodeEnv: parsed.data.NODE_ENV ?? "development",
    port: readPort(parsed.data.PORT),
    databaseUrl: readDatabaseUrl(parsed.data.DATABASE_URL),
    celoNetwork: parsed.data.CELO_NETWORK ?? "sepolia",
  };
}
