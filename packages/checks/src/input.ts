import type { Address, Hex, TxHash } from "@preflight/core";
import { getAddress, isAddress, isHex } from "viem";

const TRACKS = ["t1", "t2", "t3", "t4"] as const;

export type TrackName = (typeof TRACKS)[number];

export class EntryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryInputError";
  }
}

export interface EntryInput {
  readonly network: "mainnet" | "testnet";
  readonly tracks: readonly TrackName[];
  readonly agentWallet: Address;
  readonly teamWallets?: readonly Address[];
  readonly erc8004AgentId?: string;
  readonly selfAgentId?: string;
  readonly attributionCode?: string;
  readonly repoUrl?: string;
  readonly x402Url?: string;
  readonly x402Method?: "GET" | "POST";
  readonly payTo?: Address;
  readonly x402PaymentTxs?: readonly TxHash[];
  readonly textileTxs?: readonly TxHash[];
  readonly altanaWallet?: Address;
  readonly altanaSessionPublicKey?: Hex;
  readonly altanaRevokeTx?: TxHash;
  readonly xPostUrl?: string;
  readonly agentVaultSite?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EntryInputError("entry input must be an object");
  }
  return value as Record<string, unknown>;
}

function address(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new EntryInputError(`${label} must be an address`);
  }
  return getAddress(value);
}

function optionalAddress(value: unknown, label: string): Address | undefined {
  if (value === undefined) {
    return undefined;
  }
  return address(value, label);
}

function hash(value: unknown, label: string): TxHash {
  if (typeof value !== "string" || !isHex(value) || value.length !== 66) {
    throw new EntryInputError(`${label} must be a 32-byte hash`);
  }
  return value.toLowerCase() as TxHash;
}

function hashList(value: unknown, label: string): readonly TxHash[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new EntryInputError(`${label} must be an array`);
  }
  return value.map((item, index) => hash(item, `${label}[${index}]`));
}

function isTrack(value: string): value is TrackName {
  return TRACKS.some((track) => track === value);
}

function tracks(value: unknown): readonly TrackName[] {
  if (!Array.isArray(value)) {
    throw new EntryInputError("tracks must be an array");
  }
  const parsed: TrackName[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !isTrack(item)) {
      throw new EntryInputError(`tracks[${index}] must be t1, t2, t3, or t4`);
    }
    parsed.push(item);
  }
  return parsed;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new EntryInputError(`${label} must be a non-empty string`);
  }
  return value;
}

export function parseEntryInput(value: unknown): EntryInput {
  const record = asRecord(value);
  const network = record.network === undefined ? "mainnet" : record.network;
  if (network !== "mainnet" && network !== "testnet") {
    throw new EntryInputError("network must be mainnet or testnet");
  }

  const method = record.x402Method;
  if (method !== undefined && method !== "GET" && method !== "POST") {
    throw new EntryInputError("x402Method must be GET or POST");
  }

  const agentId = optionalString(record.erc8004AgentId, "erc8004AgentId");
  if (agentId !== undefined && !/^[0-9]+$/.test(agentId)) {
    throw new EntryInputError("erc8004AgentId must be a decimal token id");
  }

  const attributionCode = optionalString(record.attributionCode, "attributionCode");
  if (attributionCode !== undefined && !/^celo_[0-9a-f]{8,64}$/i.test(attributionCode)) {
    throw new EntryInputError("attributionCode must look like celo_ followed by hex");
  }

  const sessionKeyText = optionalString(record.altanaSessionPublicKey, "altanaSessionPublicKey");
  let sessionKey: Hex | undefined;
  if (sessionKeyText !== undefined) {
    if (!isHex(sessionKeyText)) {
      throw new EntryInputError("altanaSessionPublicKey must be hex");
    }
    sessionKey = sessionKeyText;
  }

  const team = record.teamWallets;
  let teamWallets: readonly Address[] | undefined;
  if (team !== undefined) {
    if (!Array.isArray(team)) {
      throw new EntryInputError("teamWallets must be an array");
    }
    teamWallets = team.map((item, index) => address(item, `teamWallets[${index}]`));
  }

  const selfAgentId = optionalString(record.selfAgentId, "selfAgentId");
  const repoUrl = optionalString(record.repoUrl, "repoUrl");
  const x402Url = optionalString(record.x402Url, "x402Url");
  const payTo = optionalAddress(record.payTo, "payTo");
  const x402PaymentTxs = hashList(record.x402PaymentTxs, "x402PaymentTxs");
  const textileTxs = hashList(record.textileTxs, "textileTxs");
  const altanaWallet = optionalAddress(record.altanaWallet, "altanaWallet");
  const altanaRevokeTx =
    record.altanaRevokeTx === undefined ? undefined : hash(record.altanaRevokeTx, "altanaRevokeTx");
  const xPostUrl = optionalString(record.xPostUrl, "xPostUrl");
  const agentVaultSite = optionalString(record.agentVaultSite, "agentVaultSite");

  const parsed: {
    -readonly [K in keyof EntryInput]: EntryInput[K];
  } = {
    network,
    tracks: record.tracks === undefined ? [] : tracks(record.tracks),
    agentWallet: address(record.agentWallet, "agentWallet"),
  };
  if (teamWallets !== undefined) {
    parsed.teamWallets = teamWallets;
  }
  if (agentId !== undefined) {
    parsed.erc8004AgentId = agentId;
  }
  if (selfAgentId !== undefined) {
    parsed.selfAgentId = selfAgentId;
  }
  if (attributionCode !== undefined) {
    parsed.attributionCode = attributionCode.toLowerCase();
  }
  if (repoUrl !== undefined) {
    parsed.repoUrl = repoUrl;
  }
  if (x402Url !== undefined) {
    parsed.x402Url = x402Url;
  }
  if (method !== undefined) {
    parsed.x402Method = method;
  }
  if (payTo !== undefined) {
    parsed.payTo = payTo;
  }
  if (x402PaymentTxs !== undefined) {
    parsed.x402PaymentTxs = x402PaymentTxs;
  }
  if (textileTxs !== undefined) {
    parsed.textileTxs = textileTxs;
  }
  if (altanaWallet !== undefined) {
    parsed.altanaWallet = altanaWallet;
  }
  if (sessionKey !== undefined) {
    parsed.altanaSessionPublicKey = sessionKey;
  }
  if (altanaRevokeTx !== undefined) {
    parsed.altanaRevokeTx = altanaRevokeTx;
  }
  if (xPostUrl !== undefined) {
    parsed.xPostUrl = xPostUrl;
  }
  if (agentVaultSite !== undefined) {
    parsed.agentVaultSite = agentVaultSite;
  }
  return parsed;
}
