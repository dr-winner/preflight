import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainnet, testnet } from "@preflight/config";
import type { Hex, TextileLog, TxHash } from "@preflight/core";
import { getAddress, keccak256, toBytes } from "viem";
import { createTextileReader } from "./textile.js";

describe("textile reader", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/textile-reactor.json", import.meta.url), "utf8"),
  ) as {
    hash: TxHash;
    from: Hex;
    to: Hex;
    status: "success" | "reverted";
    logs: TextileLog[];
  };

  it("classifies a real reactor swap as a USDT and wARS fill", async () => {
    expect(keccak256(toBytes("Fill(bytes32,address,address,uint256)"))).toBe(
      "0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66",
    );
    const reader = createTextileReader({ table: mainnet });
    const result = await reader.classify({
      hash: fixture.hash,
      from: fixture.from,
      to: fixture.to,
      input: "0x",
      status: fixture.status,
      logs: fixture.logs,
    });

    expect(result.toReactor).toBe(true);
    expect(result.success).toBe(true);
    expect(result.touchesUsdt).toBe(true);
    expect(result.corridorToken?.toLowerCase()).toBe("0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d");
    expect(result.fill?.filler).toBe(getAddress(fixture.from));
    expect(result.fill?.swapper.toLowerCase()).toBe("0x25a5c1ae633eb3e1988cfdeed07cdbd2e998ab52");
  });

  it("has no reactor on testnet", async () => {
    const reader = createTextileReader({ table: testnet });
    expect(reader.reactor).toBeNull();
    const result = await reader.classify({
      hash: fixture.hash,
      from: fixture.from,
      to: fixture.to,
      input: "0x",
      status: fixture.status,
      logs: fixture.logs,
    });
    expect(result.toReactor).toBe(false);
  });
});
