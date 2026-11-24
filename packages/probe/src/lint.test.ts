import { describe, expect, it } from "vitest";
import { mainnet, testnet } from "@preflight/config";
import { lintExchange, type Exchange } from "./lint.js";

function required(body: unknown): string {
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

const goodAccept = {
  scheme: "exact",
  network: "eip155:11142220",
  amount: "10000",
  asset: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2" },
};

function exchange(partial: Omit<Partial<Exchange>, "body"> & { body?: unknown }): Exchange {
  const body = typeof partial.body === "string" ? partial.body : JSON.stringify(partial.body ?? {});
  return {
    status: partial.status ?? 402,
    headers: partial.headers ?? {},
    body,
    ...(partial.tls === undefined ? {} : { tls: partial.tls }),
    ...(partial.options === undefined ? {} : { options: partial.options }),
  };
}

describe("x402 and passive lint", () => {
  it("passes a well-formed Sepolia 402", () => {
    const payload = {
      x402Version: 2,
      resource: { url: "https://seller.example/paid" },
      accepts: [goodAccept],
    };
    const results = lintExchange(
      { url: "https://seller.example/paid", method: "GET", expectedNetwork: "testnet" },
      exchange({
        headers: {
          "payment-required": required(payload),
          "content-type": "application/json",
          "x-content-type-options": "nosniff",
          "strict-transport-security": "max-age=15552000",
        },
        body: {},
        tls: { protocol: "TLSv1.3", authorized: true, validTo: "2030-01-01T00:00:00.000Z" },
      }),
      {
        table: testnet,
        facilitatorSigners: ["0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48"],
        supportedAssets: ["0x01C5C0122039549AD1493B8220cABEdD739BC44E"],
        facilitatorOk: true,
        sellerSettlements: { count: 1, first: "2026-11-01", last: "2026-11-24" },
      },
    );
    const byKey = Object.fromEntries(results.map((item) => [item.key, item.status]));
    expect(byKey.X1).toBe("pass");
    expect(byKey.X2).toBe("pass");
    expect(byKey.X3).toBe("pass");
    expect(byKey.X4).toBe("pass");
    expect(byKey.X6).toBe("pass");
    expect(byKey.X7).toBe("pass");
    expect(byKey.S1).toBe("pass");
    expect(byKey.S2).toBe("pass");
  });

  it("fails a misconfigured fixture", () => {
    const payload = {
      x402Version: 2,
      resource: { url: "http://seller.example/paid" },
      accepts: [
        {
          scheme: "exact",
          network: "eip155:11142220",
          amount: "5000000",
          asset: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
          payTo: "0x0000000000000000000000000000000000000000",
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", version: "9" },
        },
      ],
    };
    const results = lintExchange(
      {
        url: "http://seller.example/paid",
        method: "GET",
        expectedNetwork: "mainnet",
        payTo: "0x2222222222222222222222222222222222222222",
      },
      exchange({
        headers: {
          "payment-required": required(payload),
          "access-control-allow-origin": "*",
          "access-control-allow-credentials": "true",
          "x-powered-by": "Express",
          server: "nginx/1.25.0",
        },
        body:
          "Error\n    at handler (/node_modules/hono/dist/index.js:1:1)\nprivate key 0x" +
          "ab".repeat(32),
      }),
      {
        table: mainnet,
        facilitatorSigners: ["0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48"],
        supportedAssets: ["0xcebA9300f2b948710d2653dD7B07f33A8B32118C"],
        facilitatorOk: false,
        sellerSettlements: null,
      },
    );
    const byKey = Object.fromEntries(results.map((item) => [item.key, item.status]));
    expect(byKey.X4).toBe("fail");
    expect(byKey.X5).toBe("fail");
    expect(byKey.X6).toBe("fail");
    expect(byKey.X7).toBe("fail");
    expect(byKey.X10).toBe("fail");
    expect(byKey.X11).toBe("unknown");
    expect(byKey.S1).toBe("fail");
    expect(byKey.S5).toBe("fail");
    expect(byKey.S6).toBe("fail");
    expect(byKey.S7).toBe("fail");
    expect(results.find((item) => item.key === "S7")?.evidence).toEqual({ location: "body" });
  });
});
