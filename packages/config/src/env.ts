import { z } from "zod";
import type { NetworkName } from "@preflight/core";
import { networkTable, type NetworkTable } from "./networks.js";

const networkSchema = z.enum(["testnet", "mainnet"]);
const celoNetworkSchema = z.enum(["sepolia", "mainnet"]);

const envSchema = z.object({
  NETWORK: networkSchema.optional(),
  CELO_NETWORK: celoNetworkSchema.optional(),
  CELO_RPC_URL: z.string().min(1).optional(),
  CELO_SEPOLIA_RPC_URL: z.string().min(1).optional(),
});

export interface NetworkConfig {
  network: NetworkName;
  table: NetworkTable;
  rpcUrl: string;
}

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

function asHttpUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid environment: ${name}: must be an http(s) URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Invalid environment: ${name}: must be an http(s) URL`);
  }
  return value;
}

function resolveNetwork(
  network: "testnet" | "mainnet" | undefined,
  celoNetwork: "sepolia" | "mainnet" | undefined,
): NetworkName {
  const fromCelo =
    celoNetwork === undefined ? undefined : celoNetwork === "sepolia" ? "testnet" : "mainnet";
  if (network !== undefined && fromCelo !== undefined && network !== fromCelo) {
    throw new Error("Invalid environment: NETWORK and CELO_NETWORK disagree");
  }
  return network ?? fromCelo ?? "testnet";
}

export function loadNetworkConfig(env: NodeJS.ProcessEnv = process.env): NetworkConfig {
  const parsed = envSchema.safeParse({
    NETWORK: blankToUndefined(env.NETWORK),
    CELO_NETWORK: blankToUndefined(env.CELO_NETWORK),
    CELO_RPC_URL: blankToUndefined(env.CELO_RPC_URL),
    CELO_SEPOLIA_RPC_URL: blankToUndefined(env.CELO_SEPOLIA_RPC_URL),
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${formatIssues(parsed.error)}`);
  }

  const network = resolveNetwork(parsed.data.NETWORK, parsed.data.CELO_NETWORK);
  const table = networkTable(network);
  const override =
    network === "mainnet" ? parsed.data.CELO_RPC_URL : parsed.data.CELO_SEPOLIA_RPC_URL;
  const rpcUrl =
    override === undefined
      ? table.rpcUrl
      : asHttpUrl(override, network === "mainnet" ? "CELO_RPC_URL" : "CELO_SEPOLIA_RPC_URL");

  return { network, table, rpcUrl };
}
