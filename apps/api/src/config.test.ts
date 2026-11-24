import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig network switch", () => {
  it("defaults to Sepolia and accepts the mainnet switch", () => {
    expect(loadConfig({}).network.table.chainId).toBe(11142220);
    expect(loadConfig({ NETWORK: "mainnet" }).network.network).toBe("mainnet");
    expect(loadConfig({ CELO_NETWORK: "sepolia" }).network.table.caip2).toBe("eip155:11142220");
  });
});
