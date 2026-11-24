import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainnet } from "@preflight/config";
import { getAddress } from "viem";
import { createErc8004Reader } from "./erc8004.js";

describe("ERC-8004 reader", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/erc8004-mainnet.json", import.meta.url), "utf8"),
  ) as {
    agentId: string;
    calls: { ownerOf: string; getAgentWallet: string; tokenURI: string; balanceOf: string };
  };

  it("returns the recorded mainnet registry reads", async () => {
    const reader = createErc8004Reader({
      network: "mainnet",
      registry: mainnet.erc8004Identity,
      read: {
        readContract: ({ functionName }) => {
          const value = fixture.calls[functionName as keyof typeof fixture.calls];
          if (functionName === "balanceOf") {
            return Promise.resolve(BigInt(value));
          }
          return Promise.resolve(value);
        },
      },
    });
    const agentId = BigInt(fixture.agentId);
    expect(await reader.ownerOf(agentId)).toBe(getAddress(fixture.calls.ownerOf));
    expect(await reader.getAgentWallet(agentId)).toBe(getAddress(fixture.calls.getAgentWallet));
    expect(await reader.tokenURI(agentId)).toBe(fixture.calls.tokenURI);
    expect(await reader.balanceOf(fixture.calls.ownerOf as `0x${string}`)).toBe(
      BigInt(fixture.calls.balanceOf),
    );
  });
});
