import type { Address, Hex, TagDecoder, TxHash, X402SettlementReader } from "@preflight/core";
import { HANDLE_OPS_SELECTORS, TX_LIST_CAP } from "./constants.js";
import type { OutgoingTransaction, TxHistoryReader, UserOpTagDecoder } from "./extensions.js";
import { tryRead, type ReadResult } from "./read.js";
import { sameAddress } from "./wallets.js";

export interface ScannedTx {
  hash: TxHash;
  from: Address;
  blockNumber: string;
  index: number;
  codes: readonly string[];
  schemaId: number | null;
  via: "suffix" | "marker" | "userop" | null;
}

export interface TagScan {
  txs: readonly ScannedTx[];
  truncated: boolean;
  excludedFacilitator: number;
}

function selectorOf(input: Hex): string {
  return input.length >= 10 ? input.slice(0, 10).toLowerCase() : "0x";
}

function isHandleOps(selector: string): boolean {
  return HANDLE_OPS_SELECTORS.some((item) => item === selector);
}

function decodeTx(
  tx: OutgoingTransaction,
  watched: ReadonlySet<string>,
  tags: TagDecoder,
  userOps: UserOpTagDecoder,
): Pick<ScannedTx, "codes" | "schemaId" | "via"> {
  const direct = tags.decode(tx.input);
  if (direct !== null && direct.codes.length > 0) {
    return { codes: direct.codes, schemaId: direct.schemaId, via: direct.via };
  }
  if (!isHandleOps(selectorOf(tx.input))) {
    return { codes: [], schemaId: null, via: null };
  }
  const ops = userOps.decode(tx.input);
  if (ops === null) {
    return { codes: [], schemaId: null, via: null };
  }
  const codes: string[] = [];
  let schemaId: number | null = null;
  for (const op of ops) {
    if (!watched.has(op.sender.toLowerCase())) {
      continue;
    }
    if (op.codes.length === 0) {
      continue;
    }
    codes.push(...op.codes);
    schemaId = op.schemaId;
  }
  if (codes.length === 0) {
    return { codes: [], schemaId: null, via: null };
  }
  return { codes, schemaId, via: "userop" };
}

function compareTx(left: OutgoingTransaction, right: OutgoingTransaction): number {
  const block = BigInt(left.blockNumber) - BigInt(right.blockNumber);
  if (block !== 0n) {
    return block > 0n ? 1 : -1;
  }
  if (left.index !== right.index) {
    return left.index - right.index;
  }
  return left.hash.localeCompare(right.hash);
}

export async function scanOutgoing(options: {
  history: TxHistoryReader;
  x402: X402SettlementReader;
  tags: TagDecoder;
  userOps: UserOpTagDecoder;
  wallets: readonly Address[];
}): Promise<ReadResult<TagScan>> {
  const lists = await Promise.all(
    options.wallets.map((wallet) => tryRead(() => options.history.listOutgoing(wallet))),
  );
  const failed = lists.find((list) => !list.ok);
  if (failed !== undefined && !failed.ok) {
    return failed;
  }
  const signers = await tryRead(() => options.x402.getFacilitatorSigners());
  if (!signers.ok) {
    return signers;
  }

  const merged: OutgoingTransaction[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list.ok) {
      continue;
    }
    for (const tx of list.value) {
      const key = tx.hash.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(tx);
    }
  }
  merged.sort(compareTx);

  const capped = merged.length > TX_LIST_CAP;
  const pageCapped = lists.some((list) => list.ok && list.value.length >= TX_LIST_CAP);
  const window = merged.slice(0, TX_LIST_CAP);

  let excludedFacilitator = 0;
  const kept: OutgoingTransaction[] = [];
  for (const tx of window) {
    const facilitator = signers.value.some((signer) => sameAddress(signer, tx.from));
    if (facilitator) {
      excludedFacilitator += 1;
      continue;
    }
    kept.push(tx);
  }

  const watched = new Set(options.wallets.map((wallet) => wallet.toLowerCase()));
  try {
    const txs = kept.map((tx) => {
      const decoded = decodeTx(tx, watched, options.tags, options.userOps);
      return {
        hash: tx.hash,
        from: tx.from,
        blockNumber: tx.blockNumber,
        index: tx.index,
        codes: decoded.codes,
        schemaId: decoded.schemaId,
        via: decoded.via,
      };
    });
    return {
      ok: true,
      value: { txs, truncated: capped || pageCapped, excludedFacilitator },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "tag decode failed";
    return { ok: false, code: "unavailable", message };
  }
}
