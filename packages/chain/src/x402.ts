import type { NetworkTable } from "@preflight/config";
import type { Address, Hex, X402Settlement, X402SettlementReader } from "@preflight/core";
import { getAddress } from "viem";
import { EIP3009_SELECTORS } from "./abi.js";

const SIGNER_TTL_MS = 60 * 60 * 1000;

interface SupportedBody {
  signers?: Record<string, unknown>;
}

function selectorOf(input: Hex): string {
  return input.length >= 10 ? input.slice(0, 10).toLowerCase() : "0x";
}

function readSigners(body: unknown, caip2: string): readonly Address[] {
  if (typeof body !== "object" || body === null || !("signers" in body)) {
    throw new Error("facilitator /supported response has no signers");
  }
  const signers = (body as SupportedBody).signers;
  if (typeof signers !== "object" || signers === null) {
    throw new Error("facilitator /supported signers is not an object");
  }
  const list = signers[caip2];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`facilitator /supported has no signers for ${caip2}`);
  }
  return list.map((item) => {
    if (typeof item !== "string" || !item.startsWith("0x")) {
      throw new Error("facilitator /supported signer is not an address");
    }
    return getAddress(item);
  });
}

export function createX402SettlementReader(options: {
  table: NetworkTable;
  fetch?: typeof fetch;
  now?: () => number;
}): X402SettlementReader {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const eip3009Assets = new Set(
    options.table.x402Assets
      .filter((asset) => asset.transfer === "eip3009")
      .map((asset) => asset.address.toLowerCase()),
  );
  let cache: { at: number; signers: readonly Address[] } | undefined;

  return {
    network: options.table.name,
    async getFacilitatorSigners() {
      const current = cache;
      if (current !== undefined && now() - current.at < SIGNER_TTL_MS) {
        return current.signers;
      }
      const response = await doFetch(`${options.table.facilitatorUrl}/supported`);
      if (!response.ok) {
        throw new Error(`facilitator /supported returned ${response.status}`);
      }
      const signers = readSigners(await response.json(), options.table.caip2);
      cache = { at: now(), signers };
      return signers;
    },
    async classifySettlement(tx): Promise<X402Settlement | null> {
      if (tx.to === null) {
        return null;
      }
      const selector = selectorOf(tx.input);
      if (!EIP3009_SELECTORS.some((item) => item === selector)) {
        // Permit2 settlement shape is unverified (docs/SPEC.md §11.5).
        return null;
      }
      if (!eip3009Assets.has(tx.to.toLowerCase())) {
        return null;
      }
      const signers = await this.getFacilitatorSigners();
      const from = tx.from.toLowerCase();
      if (!signers.some((signer) => signer.toLowerCase() === from)) {
        return null;
      }
      const asset = getAddress(tx.to);
      return {
        hash: tx.hash,
        from: getAddress(tx.from),
        to: asset,
        selector: selector as Hex,
        asset,
        kind: "eip3009",
      };
    },
  };
}
