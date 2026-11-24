import type { NetworkName, TagDecoder, X402SettlementReader } from "@preflight/core";
import { fail, pass, unknown, warn } from "../domain.js";
import type { TxHistoryReader, UserOpTagDecoder } from "../extensions.js";
import { expectedAttributionCode } from "../github.js";
import type { EntryInput } from "../input.js";
import { scanOutgoing, type ScannedTx, type TagScan } from "../scan.js";
import { attributionWallets } from "../wallets.js";

const G3 = "g3.attribution.tags" as const;
const T4 = "t4.altana.tagged" as const;

const MAINNET_HINT =
  "Attribution is judged on Celo mainnet (42220). Re-run this check against mainnet.";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function tagEvidence(expected: string, scan: TagScan) {
  const firstTagged = scan.txs.find((tx) => tx.codes.length > 0) ?? null;
  const firstUntagged = scan.txs.find((tx) => tx.codes.length === 0) ?? null;
  const untaggedBeforeFirstTagged =
    firstTagged === null
      ? scan.txs.map((tx) => tx.hash)
      : scan.txs.slice(0, scan.txs.indexOf(firstTagged)).map((tx) => tx.hash);
  const tagged = scan.txs.filter((tx) => tx.codes.includes(expected)).length;
  return {
    expectedCode: expected,
    firstTaggedTx: firstTagged?.hash ?? null,
    firstUntaggedTx: firstUntagged?.hash ?? null,
    untaggedBeforeFirstTagged,
    tagged,
    total: scan.txs.length,
    codesSeen: unique(scan.txs.flatMap((tx) => tx.codes)),
    excludedFacilitator: scan.excludedFacilitator,
    truncated: scan.truncated,
  };
}

async function scanWallets(
  input: EntryInput,
  wallets: readonly (typeof input.agentWallet)[],
  history: TxHistoryReader,
  x402: X402SettlementReader,
  tags: TagDecoder,
  userOps: UserOpTagDecoder,
) {
  if (wallets.length === 0) {
    return { ok: false as const, code: "not_found" as const, message: "no wallets" };
  }
  return scanOutgoing({ history, x402, tags, userOps, wallets });
}

function mainnetReader(network: NetworkName): boolean {
  return network === "mainnet";
}

export async function checkAttributionTags(
  input: EntryInput,
  history: TxHistoryReader,
  x402: X402SettlementReader,
  tags: TagDecoder,
  userOps: UserOpTagDecoder,
) {
  const expected = expectedAttributionCode(input);
  if (expected.state === "missing") {
    return unknown(
      G3,
      { observed: false, reason: "missing_input" },
      "Set attributionCode to the celo_ code from sign-up, or pass a GitHub repoUrl.",
    );
  }
  if (!mainnetReader(history.network)) {
    return unknown(
      G3,
      {
        observed: false,
        reason: "not_observable",
        readerNetwork: history.network,
        expectedCode: expected.code,
      },
      MAINNET_HINT,
    );
  }

  const scan = await scanWallets(input, attributionWallets(input), history, x402, tags, userOps);
  if (!scan.ok) {
    return unknown(
      G3,
      {
        observed: false,
        reason: "source_failed",
        message: scan.message,
        expectedCode: expected.code,
      },
      "Retry the explorer and the facilitator /supported read. Untagged activity cannot be given a pass.",
    );
  }
  if (scan.value.truncated) {
    return unknown(
      G3,
      { observed: false, reason: "not_observable", ...tagEvidence(expected.code, scan.value) },
      "The wallet has more than 1,000 outgoing transactions. Narrow the history before calling this a pass.",
    );
  }
  if (scan.value.txs.length === 0) {
    return unknown(
      G3,
      {
        observed: false,
        reason: "not_observable",
        expectedCode: expected.code,
        excludedFacilitator: scan.value.excludedFacilitator,
      },
      "The wallet has no mainnet transactions to judge. Send a tagged mainnet transaction first.",
    );
  }

  const evidence = tagEvidence(expected.code, scan.value);
  const first = scan.value.txs[0];
  const firstTagged = scan.value.txs.find((tx) => tx.codes.length > 0);
  if (first === undefined || firstTagged === undefined) {
    return fail(
      G3,
      { observed: false, reason: "absent", ...evidence },
      `No tagged mainnet transaction. Send one with ${expected.code} before any other mainnet activity.`,
    );
  }

  const different = evidence.codesSeen.filter(
    (code) => code.startsWith("celo_") && code !== expected.code,
  );
  const firstTaggedHasExpected = firstTagged.codes.includes(expected.code);
  const droppedLater = scan.value.txs
    .slice(scan.value.txs.indexOf(firstTagged))
    .filter((tx) => !tx.codes.includes(expected.code));

  if (different.length > 0) {
    return warn(
      G3,
      { observed: true, ...evidence, differentCodes: different },
      `Leaderboards only credit the assigned code. Found ${different.join(", ")}; this entry expects ${expected.code}.`,
    );
  }
  if (firstTaggedHasExpected && droppedLater.length > 0) {
    const dropped = droppedLater[0];
    return fail(
      G3,
      {
        observed: false,
        reason: "contradicted",
        ...evidence,
        droppedAfterFirstTagged: droppedLater.map((tx) => tx.hash),
      },
      `Transaction ${dropped?.hash ?? "unknown"} is missing ${expected.code}. Tag every transaction after the first tagged one.`,
    );
  }
  if (!first.codes.includes(expected.code)) {
    return warn(
      G3,
      { observed: true, ...evidence },
      `Untagged transactions before ${firstTagged.hash} can never be credited. Tag every transaction from the first one with ${expected.code}.`,
    );
  }
  return pass(
    G3,
    { observed: true, ...evidence },
    `No change needed. Keep tagging every mainnet transaction with ${expected.code}.`,
  );
}

function txHas(tx: ScannedTx, code: string): boolean {
  return tx.codes.includes(code);
}

export async function checkAltanaTagged(
  input: EntryInput,
  history: TxHistoryReader,
  x402: X402SettlementReader,
  tags: TagDecoder,
  userOps: UserOpTagDecoder,
) {
  if (input.altanaWallet === undefined) {
    return unknown(
      T4,
      { observed: false, reason: "missing_input" },
      "Submit the Altana wallet. Its transactions need appCode set to your celo_ code.",
    );
  }
  const expected = expectedAttributionCode(input);
  if (expected.state === "missing") {
    return unknown(
      T4,
      { observed: false, reason: "missing_input", altanaWallet: input.altanaWallet },
      "Set attributionCode so the Altana appCode can be checked.",
    );
  }
  if (!mainnetReader(history.network)) {
    return unknown(
      T4,
      { observed: false, reason: "not_observable", readerNetwork: history.network },
      MAINNET_HINT,
    );
  }

  const hint = `createClient({ chains: [CELO], appCode: ["my_app", "${expected.code}"] })`;
  const scan = await scanOutgoing({
    history,
    x402,
    tags,
    userOps,
    wallets: [input.altanaWallet],
  });
  if (!scan.ok) {
    return unknown(
      T4,
      { observed: false, reason: "source_failed", message: scan.message },
      "Retry the Altana wallet history. A missing tag list cannot pass.",
    );
  }
  if (scan.value.truncated) {
    return unknown(
      T4,
      { observed: false, reason: "not_observable", expectedCode: expected.code },
      "History was capped at 1,000 transactions, so the Altana tag check cannot pass.",
    );
  }
  if (scan.value.txs.length === 0) {
    return unknown(
      T4,
      {
        observed: false,
        reason: "not_observable",
        expectedCode: expected.code,
        excludedFacilitator: scan.value.excludedFacilitator,
      },
      "The Altana wallet has no mainnet transactions yet. Send one with the appCode above.",
    );
  }

  const matched = scan.value.txs.filter((tx) => txHas(tx, "altana") && txHas(tx, expected.code));
  const different = unique(
    scan.value.txs
      .flatMap((tx) => tx.codes)
      .filter((code) => code.startsWith("celo_") && code !== expected.code),
  );
  const evidence = {
    expectedCode: expected.code,
    altanaWallet: input.altanaWallet,
    matchedTxs: matched.map((tx) => tx.hash),
    codesSeen: unique(scan.value.txs.flatMap((tx) => tx.codes)),
    total: scan.value.txs.length,
  };
  if (matched.length > 0 && different.length === 0) {
    return pass(
      T4,
      { observed: true, ...evidence },
      `No change needed. Keep appCode including ${expected.code}.`,
    );
  }
  if (different.length > 0 && scan.value.txs.some((tx) => txHas(tx, "altana"))) {
    return warn(
      T4,
      { observed: true, ...evidence, differentCodes: different },
      `Leaderboards only credit the assigned code. ${hint}`,
    );
  }
  return fail(T4, { observed: false, reason: "absent", ...evidence }, hint);
}
