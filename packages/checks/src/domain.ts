import type { JsonObject } from "./json.js";

/**
 * Catalogue ids from docs/SPEC.md §2.
 * `g3.attribution.tags` follows that section's dotted form.
 */
export const CHECK_KEYS = [
  "g1.erc8004.registered",
  "g2.erc8004.wallet_match",
  "g3.attribution.tags",
  "g4.repo.public",
  "g5.repo.code_window",
  "g6.mainnet.activity",
  "g7.x402.payto_registered",
  "g9.self.recommended",
  "t3.self.agent_mainnet",
  "t3.x402.payment_hash",
  "t4.altana.wallet",
  "t4.altana.session_key",
  "t4.altana.revoked",
  "t4.altana.tagged",
] as const;

export type CheckKey = (typeof CHECK_KEYS)[number];

export type TrackId = "global" | "t3" | "t4";

export type CheckStatus = "pass" | "fail" | "warn" | "unknown";

export type UnknownReason = "missing_input" | "source_failed" | "not_observable" | "manual";

export type FailReason = "contradicted" | "absent";

const evidenceKind: unique symbol = Symbol("preflight.evidence");

export type Satisfied<E extends JsonObject> = E & {
  readonly [evidenceKind]: "satisfied";
};

export type Unsatisfied<E extends JsonObject> = E & {
  readonly [evidenceKind]: "unsatisfied";
};

export interface PassResult<K extends CheckKey, E extends JsonObject> {
  readonly status: "pass";
  readonly key: K;
  readonly track: TrackId;
  readonly evidence: Satisfied<E & { readonly observed: true }>;
  readonly hint: string;
}

export interface WarnResult<K extends CheckKey, E extends JsonObject> {
  readonly status: "warn";
  readonly key: K;
  readonly track: TrackId;
  readonly evidence: Satisfied<E & { readonly observed: true }>;
  readonly hint: string;
}

export interface FailResult<K extends CheckKey, E extends JsonObject> {
  readonly status: "fail";
  readonly key: K;
  readonly track: TrackId;
  readonly evidence: Unsatisfied<E & { readonly observed: false }>;
  readonly hint: string;
}

export interface UnknownResult<K extends CheckKey, E extends JsonObject> {
  readonly status: "unknown";
  readonly key: K;
  readonly track: TrackId;
  readonly evidence: Unsatisfied<E & { readonly observed: false }>;
  readonly hint: string;
}

export function trackOf(key: CheckKey): TrackId {
  if (key.startsWith("t3.")) {
    return "t3";
  }
  if (key.startsWith("t4.")) {
    return "t4";
  }
  return "global";
}

function requiredHint(hint: string): string {
  if (hint.trim() === "") {
    throw new Error("check hint is empty");
  }
  return hint;
}

export function pass<K extends CheckKey, E extends JsonObject & { readonly observed: true }>(
  key: K,
  evidence: E,
  hint: string,
): PassResult<K, E> {
  const branded: Satisfied<E> = { ...evidence, [evidenceKind]: "satisfied" };
  return {
    status: "pass",
    key,
    track: trackOf(key),
    evidence: branded,
    hint: requiredHint(hint),
  };
}

export function warn<K extends CheckKey, E extends JsonObject & { readonly observed: true }>(
  key: K,
  evidence: E,
  hint: string,
): WarnResult<K, E> {
  const branded: Satisfied<E> = { ...evidence, [evidenceKind]: "satisfied" };
  return {
    status: "warn",
    key,
    track: trackOf(key),
    evidence: branded,
    hint: requiredHint(hint),
  };
}

export function fail<
  K extends CheckKey,
  E extends JsonObject & { readonly observed: false; readonly reason: FailReason },
>(key: K, evidence: E, hint: string): FailResult<K, E> {
  const branded: Unsatisfied<E> = { ...evidence, [evidenceKind]: "unsatisfied" };
  return {
    status: "fail",
    key,
    track: trackOf(key),
    evidence: branded,
    hint: requiredHint(hint),
  };
}

export function unknown<
  K extends CheckKey,
  E extends JsonObject & { readonly observed: false; readonly reason: UnknownReason },
>(key: K, evidence: E, hint: string): UnknownResult<K, E> {
  const branded: Unsatisfied<E> = { ...evidence, [evidenceKind]: "unsatisfied" };
  return {
    status: "unknown",
    key,
    track: trackOf(key),
    evidence: branded,
    hint: requiredHint(hint),
  };
}
