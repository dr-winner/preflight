import type { NetworkTable } from "@preflight/config";
import { EIP8004_REGISTRATION_TYPE } from "./constants.js";

export interface ParsedRegistration {
  type: typeof EIP8004_REGISTRATION_TYPE;
  services: readonly { name: string; endpoint: string }[];
  x402Support: boolean;
  agentRegistry: string;
}

export function expectedAgentRegistry(table: NetworkTable): string {
  return `${table.caip2}:${table.erc8004Identity}`;
}

export function parseRegistrationDocument(
  value: unknown,
  expectedRegistry: string,
): { ok: true; value: ParsedRegistration } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "registration JSON is not an object" };
  }
  const record = value as Record<string, unknown>;
  if (record.type !== EIP8004_REGISTRATION_TYPE) {
    return { ok: false, reason: "type is not the ERC-8004 registration-v1 type" };
  }
  if (!Array.isArray(record.services)) {
    return { ok: false, reason: "services[] is missing" };
  }
  const services: { name: string; endpoint: string }[] = [];
  for (const service of record.services) {
    if (typeof service !== "object" || service === null) {
      return { ok: false, reason: "a services[] entry is not an object" };
    }
    const item = service as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.endpoint !== "string") {
      return { ok: false, reason: "services[] entries need a name and an endpoint" };
    }
    services.push({ name: item.name, endpoint: item.endpoint });
  }
  if (typeof record.x402Support !== "boolean") {
    return { ok: false, reason: "x402Support is missing" };
  }
  if (!Array.isArray(record.registrations) || record.registrations.length === 0) {
    return { ok: false, reason: "registrations[] is missing" };
  }
  const expected = expectedRegistry.toLowerCase();
  let agentRegistry: string | null = null;
  for (const registration of record.registrations) {
    if (typeof registration !== "object" || registration === null) {
      continue;
    }
    const candidate = (registration as Record<string, unknown>).agentRegistry;
    if (typeof candidate === "string" && candidate.toLowerCase() === expected) {
      agentRegistry = candidate;
      break;
    }
  }
  if (agentRegistry === null) {
    return {
      ok: false,
      reason: `registrations[].agentRegistry is not ${expectedRegistry}`,
    };
  }
  return {
    ok: true,
    value: {
      type: EIP8004_REGISTRATION_TYPE,
      services,
      x402Support: record.x402Support,
      agentRegistry,
    },
  };
}

export type TokenUriJson =
  | { readonly state: "json"; readonly value: unknown }
  | { readonly state: "remote" }
  | { readonly state: "unsupported" };

export function decodeTokenUri(tokenUri: string): TokenUriJson {
  const trimmed = tokenUri.trim();
  if (trimmed.startsWith("data:")) {
    const comma = tokenUri.indexOf(",");
    if (comma === -1) {
      return { state: "unsupported" };
    }
    const meta = tokenUri.slice("data:".length, comma);
    const data = tokenUri.slice(comma + 1);
    try {
      const text = meta.toLowerCase().includes("base64")
        ? Buffer.from(data, "base64").toString("utf8")
        : decodeURIComponent(data);
      return { state: "json", value: JSON.parse(text) as unknown };
    } catch {
      return { state: "unsupported" };
    }
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("https:") || lower.startsWith("ipfs:")) {
    return { state: "remote" };
  }
  return { state: "unsupported" };
}
