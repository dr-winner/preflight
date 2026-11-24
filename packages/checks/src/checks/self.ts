import type { Address, Hex, SelfAgentInfo, SelfReader } from "@preflight/core";
import { pad } from "viem";
import { MAINNET_CHAIN_ID, PROOF_EXPIRY_WARN_MS } from "../constants.js";
import { fail, pass, unknown, warn } from "../domain.js";
import type { EntryInput } from "../input.js";
import { tryRead } from "../read.js";

const G9 = "g9.self.recommended" as const;
const T3 = "t3.self.agent_mainnet" as const;

const MAINNET_HINT =
  "Celo Sepolia accepts mock passports only; register on mainnet with a real passport";
const RECOMMENDED_HINT = "Self Agent ID is recommended for all tracks.";

type Expiry = "missing" | "unparseable" | "past" | "soon" | "ok";

function expiryOf(iso: string | null, now: Date): Expiry {
  if (iso === null) {
    return "missing";
  }
  const time = Date.parse(iso);
  if (Number.isNaN(time)) {
    return "unparseable";
  }
  if (time <= now.getTime()) {
    return "past";
  }
  if (time < now.getTime() + PROOF_EXPIRY_WARN_MS) {
    return "soon";
  }
  return "ok";
}

export async function checkSelfRecommended(input: EntryInput, self: SelfReader) {
  if (self.network !== input.network) {
    return unknown(
      G9,
      {
        observed: false,
        reason: "source_failed",
        message: "Self reader network does not match the entry",
      },
      "Retry with a Self reader on the same network as the entry.",
    );
  }

  const agents = await tryRead(() => self.getAgentsByAddress(input.agentWallet));
  if (!agents.ok && agents.code === "unavailable") {
    return unknown(
      G9,
      { observed: false, reason: "source_failed", message: agents.message },
      "Retry the Self API. A failed lookup cannot pass or warn as if the agent were missing.",
    );
  }

  const found = agents.ok ? [...agents.value] : [];
  const selfAgentId = input.selfAgentId;
  if (selfAgentId !== undefined) {
    const info = await tryRead(() => self.getAgentInfo(selfAgentId));
    if (!info.ok && info.code === "unavailable") {
      return unknown(
        G9,
        { observed: false, reason: "source_failed", message: info.message },
        "Retry the Self API before treating this agent id as missing.",
      );
    }
    if (info.ok && !found.some((agent) => agent.agentId === info.value.agentId)) {
      found.push(info.value);
    }
  }

  if (found.length > 0) {
    return pass(
      G9,
      {
        observed: true,
        chainId: self.chainId,
        agentIds: found.map((agent) => agent.agentId),
      },
      "No change needed. Keep the Self agent registered for this wallet.",
    );
  }
  return warn(G9, { observed: true, chainId: self.chainId, agentIds: [] }, RECOMMENDED_HINT);
}

function infoEvidence(info: SelfAgentInfo) {
  return {
    agentId: info.agentId,
    chainId: info.chainId,
    network: info.network,
    isVerified: info.isVerified,
    hasHumanProof: info.hasHumanProof,
    isProofFresh: info.isProofFresh,
    proofExpiresAt: info.proofExpiresAt,
    agentAddress: info.agentAddress,
    verificationStrength: info.verificationStrength,
    strengthLabel: info.strengthLabel,
  };
}

export async function checkSelfAgentMainnet(input: EntryInput, self: SelfReader, now: Date) {
  const selfAgentId = input.selfAgentId;
  if (selfAgentId === undefined) {
    return fail(T3, { observed: false, reason: "absent", chainId: self.chainId }, MAINNET_HINT);
  }
  if (self.chainId !== MAINNET_CHAIN_ID) {
    const info = await tryRead(() => self.getAgentInfo(selfAgentId));
    return fail(
      T3,
      {
        observed: false,
        reason: "contradicted",
        chainId: self.chainId,
        ...(info.ok ? { agent: infoEvidence(info.value) } : { lookup: info.message }),
      },
      MAINNET_HINT,
    );
  }

  const info = await tryRead(() => self.getAgentInfo(selfAgentId));
  if (!info.ok) {
    if (info.code === "not_found") {
      return fail(
        T3,
        { observed: false, reason: "absent", agentId: selfAgentId, chainId: self.chainId },
        MAINNET_HINT,
      );
    }
    return unknown(
      T3,
      { observed: false, reason: "source_failed", message: info.message, agentId: selfAgentId },
      "Retry GET /api/agent/info/42220/{agentId}. A failed lookup cannot pass.",
    );
  }

  const body = info.value;
  const expiry = expiryOf(body.proofExpiresAt, now);
  const base = infoEvidence(body);

  if (body.chainId !== MAINNET_CHAIN_ID || body.network !== "mainnet") {
    return fail(T3, { observed: false, reason: "contradicted", ...base }, MAINNET_HINT);
  }
  if (!body.isVerified || !body.hasHumanProof) {
    return fail(
      T3,
      { observed: false, reason: "contradicted", ...base },
      "Finish Self verification with a real passport on Celo mainnet.",
    );
  }
  if (!body.isProofFresh || expiry === "past") {
    return fail(
      T3,
      { observed: false, reason: "contradicted", ...base, expiry },
      "Renew the human proof. isVerifiedAgent stays true after expiry, so freshness has to be true too.",
    );
  }
  if (body.agentAddress === null) {
    return unknown(
      T3,
      { observed: false, reason: "not_observable", ...base },
      "The Self response has no agentAddress, so the on-chain cross-check cannot pass.",
    );
  }
  if (expiry === "unparseable") {
    return unknown(
      T3,
      { observed: false, reason: "not_observable", ...base },
      "proofExpiresAt could not be parsed, so the 14-day warning cannot be judged.",
    );
  }

  const onChain = await crossCheck(self, body.agentAddress, body.agentId);
  if (onChain.state === "unavailable") {
    return unknown(
      T3,
      { observed: false, reason: "source_failed", message: onChain.message, ...base },
      "Retry the Self registry cross-check (getAgentId, isVerifiedAgent, isProofFresh).",
    );
  }
  if (!onChain.ok) {
    return fail(
      T3,
      { observed: false, reason: "contradicted", ...base, onChain: onChain.detail },
      "The Self API and the on-chain registry disagree. Re-register on mainnet.",
    );
  }

  const evidence = {
    ...base,
    expiry,
    onChainAgentId: onChain.agentId,
    onChainFresh: true,
    onChainVerified: true,
  };
  if (expiry === "soon" || expiry === "missing") {
    return warn(
      T3,
      { observed: true, ...evidence },
      expiry === "soon"
        ? "Renew the human proof. It expires within 14 days."
        : "proofExpiresAt was absent. Renew the passport proof if it expires within 14 days.",
    );
  }
  return pass(
    T3,
    { observed: true, ...evidence },
    "No change needed. The mainnet Self agent is verified and the proof is fresh.",
  );
}

async function crossCheck(self: SelfReader, agentAddress: Address, agentId: string) {
  let expected: bigint;
  try {
    expected = BigInt(agentId);
  } catch {
    return { state: "mismatch" as const, ok: false as const, detail: "agent id is not decimal" };
  }
  const agentKey: Hex = pad(agentAddress, { size: 32 });
  const [onChainId, verified, fresh] = await Promise.all([
    tryRead(() => self.getAgentId(agentAddress)),
    tryRead(() => self.isVerifiedAgent(agentKey)),
    tryRead(() => self.isProofFresh(expected)),
  ]);
  const unavailable = [onChainId, verified, fresh].find(
    (read) => !read.ok && read.code === "unavailable",
  );
  if (unavailable !== undefined && !unavailable.ok) {
    return { state: "unavailable" as const, message: unavailable.message };
  }
  if (!onChainId.ok || !verified.ok || !fresh.ok) {
    return {
      state: "mismatch" as const,
      ok: false as const,
      detail: "registry read returned not found",
    };
  }
  if (onChainId.value !== expected || !verified.value || !fresh.value) {
    return {
      state: "mismatch" as const,
      ok: false as const,
      detail: `onChainId=${onChainId.value.toString(10)} verified=${String(verified.value)} fresh=${String(fresh.value)}`,
    };
  }
  return { state: "ok" as const, ok: true as const, agentId: onChainId.value.toString(10) };
}
