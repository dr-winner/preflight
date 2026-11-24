import { describe, expect, it } from "vitest";
import { loadNetworkConfig, mainnet, testnet } from "./index.js";

describe("loadNetworkConfig", () => {
  it("defaults to Celo Sepolia", () => {
    const config = loadNetworkConfig({});
    expect(config.network).toBe("testnet");
    expect(config.table.chainId).toBe(11142220);
    expect(config.table.textileReactor).toBeNull();
    expect(config.rpcUrl).toBe(testnet.rpcUrl);
  });

  it("selects mainnet from NETWORK", () => {
    const config = loadNetworkConfig({ NETWORK: "mainnet" });
    expect(config.network).toBe("mainnet");
    expect(config.table.chainId).toBe(42220);
    expect(config.table.caip2).toBe("eip155:42220");
    expect(config.table.textileReactor).toBe(mainnet.textileReactor);
    expect(config.table.getLogsMaxBlockSpan).toBe(5000);
  });

  it("maps CELO_NETWORK=sepolia to testnet and mainnet to mainnet", () => {
    expect(loadNetworkConfig({ CELO_NETWORK: "sepolia" }).network).toBe("testnet");
    expect(loadNetworkConfig({ CELO_NETWORK: "mainnet" }).table.chainId).toBe(42220);
  });

  it("treats a blank NETWORK as unset", () => {
    expect(loadNetworkConfig({ NETWORK: "  " }).network).toBe("testnet");
  });

  it("rejects an unknown network and disagreeing selectors", () => {
    expect(() => loadNetworkConfig({ NETWORK: "alfajores" })).toThrow(/NETWORK/);
    expect(() => loadNetworkConfig({ NETWORK: "testnet", CELO_NETWORK: "mainnet" })).toThrow(
      /disagree/,
    );
  });

  it("uses the RPC override for the selected network", () => {
    const config = loadNetworkConfig({
      NETWORK: "mainnet",
      CELO_RPC_URL: "https://example.test/celo",
      CELO_SEPOLIA_RPC_URL: "https://example.test/sepolia",
    });
    expect(config.rpcUrl).toBe("https://example.test/celo");
  });
});
