import type { Address, NetworkName } from "@preflight/core";
import { randomBytes } from "node:crypto";
import { REPORT_DISCLAIMER, REPORT_VERSION } from "./constants.js";
import type { CheckResult, CheckRun } from "./run.js";
import type { CheckStatus, TrackId } from "./domain.js";
import type { EntryInput } from "./input.js";
import { plainObject, type JsonObject, type JsonValue } from "./json.js";

export interface TrackSummary {
  status: CheckStatus;
  blocking: string[];
  unresolved: string[];
}

export interface ReportResult {
  key: string;
  track: TrackId;
  status: CheckStatus;
  evidence: JsonObject;
  hint: string;
}

export interface ReportDataSources {
  rpc: string;
  explorer: string;
}

export interface ReportBody {
  reportId: string;
  version: typeof REPORT_VERSION;
  network: NetworkName;
  practice: boolean;
  generatedAt: string;
  input: JsonObject;
  summary: {
    global: TrackSummary;
    t3: TrackSummary;
    t4: TrackSummary;
  };
  results: ReportResult[];
  checklistManual: string[];
  dataSources: ReportDataSources;
  disclaimer: string;
  signer: Address;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createReportId(now = Date.now(), entropy: Uint8Array = randomBytes(16)): string {
  if (entropy.length < 16) {
    throw new Error("report id entropy must be 16 bytes");
  }
  return `${uuidV7(now, entropy)}${Buffer.from(entropy).toString("hex")}`;
}

export function splitPublicReportId(publicId: string): { id: string; suffix: string } | null {
  if (publicId.length !== 36 + 32) {
    return null;
  }
  const id = publicId.slice(0, 36).toLowerCase();
  const suffix = publicId.slice(36).toLowerCase();
  if (!UUID_V7.test(id) || !/^[0-9a-f]{32}$/.test(suffix)) {
    return null;
  }
  return { id, suffix };
}

function uuidV7(now: number, entropy: Uint8Array): string {
  const bytes = Uint8Array.from(entropy.subarray(0, 16));
  const time = BigInt(now);
  bytes[0] = Number((time >> 40n) & 0xffn);
  bytes[1] = Number((time >> 32n) & 0xffn);
  bytes[2] = Number((time >> 24n) & 0xffn);
  bytes[3] = Number((time >> 16n) & 0xffn);
  bytes[4] = Number((time >> 8n) & 0xffn);
  bytes[5] = Number(time & 0xffn);
  const version = bytes[6] ?? 0;
  const variant = bytes[8] ?? 0;
  bytes[6] = (version & 0x0f) | 0x70;
  bytes[8] = (variant & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function summarize(results: readonly CheckResult[], track: TrackId): TrackSummary {
  const mine = results.filter((result) => result.track === track);
  const blocking = mine.filter((result) => result.status === "fail").map((result) => result.key);
  const unresolved = mine
    .filter((result) => result.status === "unknown")
    .map((result) => result.key);
  const warned = mine.some((result) => result.status === "warn");
  let status: CheckStatus;
  if (blocking.length > 0) {
    status = "fail";
  } else if (unresolved.length > 0 || mine.length === 0) {
    status = "unknown";
  } else if (warned) {
    status = "warn";
  } else {
    status = "pass";
  }
  return { status, blocking, unresolved };
}

function stripUserinfo(value: string): string {
  try {
    const url = new URL(value);
    if (url.username === "" && url.password === "") {
      return value;
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function redactEntry(input: EntryInput): JsonObject {
  const body: Record<string, JsonValue> = {
    network: input.network,
    tracks: [...input.tracks],
    agentWallet: input.agentWallet,
  };
  const assign = (key: string, value: JsonValue | undefined) => {
    if (value !== undefined) {
      body[key] = value;
    }
  };
  assign("teamWallets", input.teamWallets === undefined ? undefined : [...input.teamWallets]);
  assign("erc8004AgentId", input.erc8004AgentId);
  assign("selfAgentId", input.selfAgentId);
  assign("attributionCode", input.attributionCode);
  assign("repoUrl", input.repoUrl === undefined ? undefined : stripUserinfo(input.repoUrl));
  assign("x402Url", input.x402Url === undefined ? undefined : stripUserinfo(input.x402Url));
  assign("x402Method", input.x402Method);
  assign("payTo", input.payTo);
  assign(
    "x402PaymentTxs",
    input.x402PaymentTxs === undefined ? undefined : [...input.x402PaymentTxs],
  );
  assign("textileTxs", input.textileTxs === undefined ? undefined : [...input.textileTxs]);
  assign("altanaWallet", input.altanaWallet);
  assign("altanaSessionPublicKey", input.altanaSessionPublicKey);
  assign("altanaRevokeTx", input.altanaRevokeTx);
  assign("xPostUrl", input.xPostUrl === undefined ? undefined : stripUserinfo(input.xPostUrl));
  assign("agentVaultSite", input.agentVaultSite);
  return body;
}

export function toReportResult(result: CheckResult): ReportResult {
  return {
    key: result.key,
    track: result.track,
    status: result.status,
    evidence: plainObject(result.evidence),
    hint: result.hint,
  };
}

export function buildReport(options: {
  reportId: string;
  generatedAt: string;
  input: EntryInput;
  run: CheckRun;
  signer: Address;
  dataSources?: ReportDataSources;
}): ReportBody {
  const split = splitPublicReportId(options.reportId);
  if (split === null) {
    throw new Error("reportId must be a UUIDv7 plus 32 hex characters");
  }
  return {
    reportId: options.reportId,
    version: REPORT_VERSION,
    network: options.input.network,
    practice: options.input.network === "testnet",
    generatedAt: options.generatedAt,
    input: redactEntry(options.input),
    summary: {
      global: summarize(options.run.results, "global"),
      t3: summarize(options.run.results, "t3"),
      t4: summarize(options.run.results, "t4"),
    },
    results: options.run.results.map((result) => toReportResult(result)),
    checklistManual: [...options.run.checklistManual],
    dataSources: options.dataSources ?? { rpc: "forno", explorer: "blockscout" },
    disclaimer: REPORT_DISCLAIMER,
    signer: options.signer,
  };
}
