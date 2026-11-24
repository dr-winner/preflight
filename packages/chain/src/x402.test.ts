import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainnet } from "@preflight/config";
import type { Hex, TxHash } from "@preflight/core";
import { getAddress } from "viem";
import { createX402SettlementReader } from "./x402.js";

function load(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

describe("x402 settlement reader", () => {
  const settlement = load("x402-settlement.json") as {
    hash: TxHash;
    from: Hex;
    to: Hex;
    input: Hex;
  };
  const supported = load("supported-mainnet.json") as { body: unknown };

  it("classifies the recorded facilitator settlement using /supported signers", async () => {
    const reader = createX402SettlementReader({
      table: mainnet,
      fetch: async () =>
        new Response(JSON.stringify(supported.body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const signers = await reader.getFacilitatorSigners();
    expect(signers.map((signer) => signer.toLowerCase())).toContain(
      "0x0d74d5cefd2e7f24e623330ebe3d8d4cb45ffb48",
    );

    const classified = await reader.classifySettlement({
      hash: settlement.hash,
      from: settlement.from,
      to: settlement.to,
      input: settlement.input,
    });

    expect(classified).toEqual({
      hash: settlement.hash,
      from: getAddress(settlement.from),
      to: getAddress(settlement.to),
      selector: "0xe3ee160e",
      asset: getAddress(settlement.to),
      kind: "eip3009",
    });
  });
});
