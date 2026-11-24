import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainnet, testnet } from "@preflight/config";
import { chunkBlockRange } from "./chunk.js";

describe("forno block chunking", () => {
  it("keeps every mainnet chunk inside the recorded 5000-block span", () => {
    const error = JSON.parse(
      readFileSync(new URL("../fixtures/forno-mainnet-range.json", import.meta.url), "utf8"),
    ) as { diff: number; response: { error: { message: string } } };
    expect(error.diff).toBe(5001);
    expect(error.response.error.message).toBe(
      "query exceeds range, retry smaller (max block range 5000, got 5001)",
    );
    expect(mainnet.getLogsMaxBlockSpan).toBe(5000);

    const chunks = chunkBlockRange(0n, 12_000n, BigInt(mainnet.getLogsMaxBlockSpan));
    expect(chunks.map((chunk) => [chunk.fromBlock, chunk.toBlock])).toEqual([
      [0n, 5000n],
      [5001n, 10_001n],
      [10_002n, 12_000n],
    ]);
    for (const chunk of chunks) {
      expect(chunk.toBlock - chunk.fromBlock <= BigInt(mainnet.getLogsMaxBlockSpan)).toBe(true);
    }
  });

  it("uses the wider Sepolia span recorded from forno", () => {
    const error = JSON.parse(
      readFileSync(new URL("../fixtures/forno-sepolia-range.json", import.meta.url), "utf8"),
    ) as { diff: number; response: { error: { message: string } } };
    expect(error.response.error.message).toContain("max block range 100000");
    expect(testnet.getLogsMaxBlockSpan).toBe(100_000);
    const chunks = chunkBlockRange(0n, 100_001n, BigInt(testnet.getLogsMaxBlockSpan));
    expect(chunks).toEqual([
      { fromBlock: 0n, toBlock: 100_000n },
      { fromBlock: 100_001n, toBlock: 100_001n },
    ]);
  });
});
