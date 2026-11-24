import { networkTable } from "@preflight/config";
import type { X402SettlementReader } from "@preflight/core";
import { fail, pass, unknown } from "../domain.js";
import type { PaymentTransaction, PaymentTxReader, TokenTransfer } from "../extensions.js";
import type { EntryInput } from "../input.js";
import { tryRead } from "../read.js";
import { sameAddress, teamAddresses } from "../wallets.js";

const T3 = "t3.x402.payment_hash" as const;

const NOT_SETTLEMENT =
  "Submit a Celo mainnet x402 settlement from the facilitator, not a direct transfer.";

type HashOutcome =
  | {
      state: "pass";
      hash: string;
      side: string;
      asset: string;
      selector: string;
      payer: string | null;
      payee: string | null;
    }
  | { state: "fail"; hash: string; detail: string }
  | { state: "unknown"; hash: string; detail: string };

function sideOf(
  transfers: readonly TokenTransfer[],
  team: ReadonlySet<string>,
): {
  side: "payer" | "payee" | "payer_and_payee" | "unrelated";
  payer: string | null;
  payee: string | null;
} {
  let payer: string | null = null;
  let payee: string | null = null;
  for (const transfer of transfers) {
    if (team.has(transfer.from.toLowerCase())) {
      payer = transfer.from;
    }
    if (team.has(transfer.to.toLowerCase())) {
      payee = transfer.to;
    }
  }
  if (payer !== null && payee !== null) {
    return { side: "payer_and_payee", payer, payee };
  }
  if (payer !== null) {
    return { side: "payer", payer, payee: null };
  }
  if (payee !== null) {
    return { side: "payee", payer: null, payee };
  }
  return { side: "unrelated", payer: null, payee: null };
}

function permit2Shape(tx: PaymentTransaction, input: EntryInput): boolean {
  if (tx.to === null) {
    return false;
  }
  const table = networkTable(input.network);
  const to = tx.to.toLowerCase();
  if (to === table.permit2.toLowerCase()) {
    return true;
  }
  return table.x402Assets.some(
    (asset) => asset.transfer === "permit2" && asset.address.toLowerCase() === to,
  );
}

async function judgeHash(
  hash: PaymentTransaction["hash"],
  input: EntryInput,
  payments: PaymentTxReader,
  x402: X402SettlementReader,
): Promise<HashOutcome> {
  const tx = await tryRead(() => payments.getTransaction(hash));
  if (!tx.ok) {
    return {
      state: tx.code === "not_found" ? "fail" : "unknown",
      hash,
      detail: tx.message,
    };
  }
  if (tx.value === null) {
    return { state: "fail", hash, detail: "transaction was not found on Celo mainnet" };
  }
  const body = tx.value;
  if (body.status !== "success") {
    return { state: "fail", hash, detail: "transaction status is not success" };
  }

  const signers = await tryRead(() => x402.getFacilitatorSigners());
  if (!signers.ok) {
    return { state: "unknown", hash, detail: signers.message };
  }
  const fromFacilitator = signers.value.some((signer) => sameAddress(signer, body.from));
  if (!fromFacilitator) {
    return { state: "fail", hash, detail: "sender is not a facilitator signer" };
  }

  const classified = await tryRead(() =>
    x402.classifySettlement({
      hash: body.hash,
      from: body.from,
      to: body.to,
      input: body.input,
    }),
  );
  if (!classified.ok) {
    return { state: "unknown", hash, detail: classified.message };
  }
  if (classified.value === null) {
    if (permit2Shape(body, input)) {
      return {
        state: "unknown",
        hash,
        detail:
          "TODO(unverified): Permit2 settlement tx shape from the Celo facilitator is not confirmed",
      };
    }
    return { state: "fail", hash, detail: "not an EIP-3009 facilitator settlement" };
  }

  const payTo = input.payTo;
  if (payTo !== undefined) {
    const paid = body.transfers.some((transfer) => sameAddress(transfer.to, payTo));
    if (!paid) {
      return { state: "fail", hash, detail: "no Transfer to the supplied payTo" };
    }
  }

  const side = sideOf(body.transfers, teamAddresses(input));
  if (side.side === "unrelated") {
    return { state: "fail", hash, detail: "settlement does not involve the entry wallet" };
  }
  return {
    state: "pass",
    hash,
    side: side.side,
    asset: classified.value.asset,
    selector: classified.value.selector,
    payer: side.payer,
    payee: side.payee,
  };
}

export async function checkX402Payment(
  input: EntryInput,
  payments: PaymentTxReader,
  x402: X402SettlementReader,
) {
  const hashes = input.x402PaymentTxs ?? [];
  if (hashes.length === 0) {
    return fail(
      T3,
      { observed: false, reason: "absent" },
      "Submit the facilitator settlement hash for the x402 payment.",
    );
  }
  if (payments.network !== "mainnet") {
    return fail(
      T3,
      { observed: false, reason: "contradicted", readerNetwork: payments.network },
      "Only a Celo mainnet facilitator settlement counts.",
    );
  }

  const outcomes: HashOutcome[] = [];
  for (const hash of hashes) {
    outcomes.push(await judgeHash(hash, input, payments, x402));
  }
  const passed = outcomes.find((outcome) => outcome.state === "pass");
  const unknownOutcome = outcomes.find((outcome) => outcome.state === "unknown");
  if (passed !== undefined && passed.state === "pass") {
    return pass(
      T3,
      {
        observed: true,
        hash: passed.hash,
        side: passed.side,
        asset: passed.asset,
        selector: passed.selector,
        payer: passed.payer,
        payee: passed.payee,
        rejected: outcomes.flatMap((outcome) =>
          outcome.state === "pass" ? [] : [{ hash: outcome.hash, detail: outcome.detail }],
        ),
      },
      "No change needed. Keep a mainnet facilitator settlement that pays the registered payTo.",
    );
  }
  if (unknownOutcome !== undefined && unknownOutcome.state === "unknown") {
    return unknown(
      T3,
      {
        observed: false,
        reason: "source_failed",
        hashes: outcomes.map((outcome) => ({
          hash: outcome.hash,
          state: outcome.state,
          detail: outcome.state === "pass" ? "matched" : outcome.detail,
        })),
      },
      "Retry the receipt and facilitator /supported read. An unreadable hash cannot pass.",
    );
  }
  return fail(
    T3,
    {
      observed: false,
      reason: "contradicted",
      hashes: outcomes.flatMap((outcome) =>
        outcome.state === "pass" ? [] : [{ hash: outcome.hash, detail: outcome.detail }],
      ),
    },
    NOT_SETTLEMENT,
  );
}
