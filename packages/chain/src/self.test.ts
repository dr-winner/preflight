import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { testnet } from "@preflight/config";
import { createSelfReader, parseSelfAgent } from "./self.js";

function load(name: string): { body: unknown } {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as {
    body: unknown;
  };
}

describe("Self reader", () => {
  it("reads recorded testnet agent 5 as verified", () => {
    const info = parseSelfAgent(load("self-agent-5-info.json").body, testnet.chainId);
    expect(info.agentId).toBe("5");
    expect(info.chainId).toBe(11142220);
    expect(info.isVerified).toBe(true);
    expect(info.hasHumanProof).toBe(true);
    expect(info.isProofFresh).toBe(true);
    expect(info.network).toBe("testnet");
    expect(info.strengthLabel).toBe("passport");
    expect(info.agentAddress?.toLowerCase()).toBe("0xa7f2b8a0ba50b099ee2ad16a91176bed96e103f7");
  });

  it("lists that agent from the address endpoint", async () => {
    const recorded = load("self-agent-5-by-address.json");
    const reader = createSelfReader({
      network: "testnet",
      chainId: testnet.chainId,
      registry: testnet.selfAgentRegistry,
      read: { readContract: () => Promise.reject(new Error("not used")) },
      fetch: async (input) => {
        expect(String(input)).toContain("/api/agent/agents/11142220/");
        return new Response(JSON.stringify(recorded.body), { status: 200 });
      },
    });
    const agents = await reader.getAgentsByAddress("0xA7F2B8A0Ba50b099Ee2ad16A91176bED96E103F7");
    expect(agents).toHaveLength(1);
    expect(agents[0]?.isVerified).toBe(true);
    expect(agents[0]?.agentId).toBe("5");
  });
});
