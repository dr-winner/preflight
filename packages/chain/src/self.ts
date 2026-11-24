import type { Address, Hex, NetworkName, SelfAgentInfo, SelfReader } from "@preflight/core";
import { getAddress, pad } from "viem";
import { selfRegistryAbi } from "./abi.js";
import type { ContractReader } from "./read.js";

const DEFAULT_API = "https://agent-api.self.xyz";

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    return null;
  }
  return getAddress(value);
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asId(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error("Self response is missing agentId");
}

function asStrength(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseSelfAgent(body: unknown, chainId: number): SelfAgentInfo {
  if (typeof body !== "object" || body === null) {
    throw new Error("Self response is not an object");
  }
  const record = body as Record<string, unknown>;
  const bodyChainId = typeof record.chainId === "number" ? record.chainId : chainId;
  return {
    agentId: asId(record.agentId),
    agentAddress: asAddress(record.agentAddress),
    chainId: bodyChainId,
    isVerified: asBool(record.isVerified),
    hasHumanProof: asBool(record.hasHumanProof),
    isProofFresh: asBool(record.isProofFresh),
    proofExpiresAt: asText(record.proofExpiresAt),
    proofProvider: asText(record.proofProvider),
    verificationStrength: asStrength(record.verificationStrength),
    strengthLabel: asText(record.strengthLabel),
    network: asText(record.network),
  };
}

function agentKey(agentAddress: Address): Hex {
  return pad(agentAddress, { size: 32 });
}

export function createSelfReader(options: {
  network: NetworkName;
  chainId: number;
  registry: Address;
  read: ContractReader;
  apiBase?: string;
  fetch?: typeof fetch;
}): SelfReader {
  const apiBase = options.apiBase ?? DEFAULT_API;
  const doFetch = options.fetch ?? fetch;
  const { network, chainId, registry, read } = options;

  async function getJson(path: string): Promise<unknown> {
    const response = await doFetch(`${apiBase}${path}`);
    if (!response.ok) {
      throw new Error(`Self API ${path} returned ${response.status}`);
    }
    return response.json();
  }

  return {
    network,
    chainId,
    registry,
    async getAgentInfo(agentId) {
      const body = await getJson(`/api/agent/info/${chainId}/${agentId}`);
      return parseSelfAgent(body, chainId);
    },
    async getAgentsByAddress(address) {
      const body = await getJson(`/api/agent/agents/${chainId}/${address}`);
      if (typeof body !== "object" || body === null || !("agents" in body)) {
        throw new Error("Self agents response has no agents array");
      }
      const agents = (body as { agents: unknown }).agents;
      if (!Array.isArray(agents)) {
        throw new Error("Self agents response has no agents array");
      }
      const parentChainId =
        typeof body === "object" &&
        body !== null &&
        "chainId" in body &&
        typeof body.chainId === "number"
          ? body.chainId
          : chainId;
      return agents.map((agent) => parseSelfAgent(agent, parentChainId));
    },
    async getAgentId(agentAddress) {
      const value = await read.readContract({
        address: registry,
        abi: selfRegistryAbi,
        functionName: "getAgentId",
        args: [agentKey(agentAddress)],
      });
      if (typeof value !== "bigint") {
        throw new Error("getAgentId did not return a uint256");
      }
      return value;
    },
    async isVerifiedAgent(key) {
      const value = await read.readContract({
        address: registry,
        abi: selfRegistryAbi,
        functionName: "isVerifiedAgent",
        args: [key],
      });
      if (typeof value !== "boolean") {
        throw new Error("isVerifiedAgent did not return a bool");
      }
      return value;
    },
    async isProofFresh(agentId) {
      const value = await read.readContract({
        address: registry,
        abi: selfRegistryAbi,
        functionName: "isProofFresh",
        args: [agentId],
      });
      if (typeof value !== "boolean") {
        throw new Error("isProofFresh did not return a bool");
      }
      return value;
    },
  };
}
