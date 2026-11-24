import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createEip191ReportSigner } from "./report/signer.js";

describe("POST /v1/preflight/passive", () => {
  it("rejects invalid input before payment", async () => {
    const app = createApp(loadConfig({}));
    const cases = [
      { body: "not-json", error: "invalid_json" },
      { body: JSON.stringify({ network: "sepolia" }), error: "invalid_input" },
      { body: JSON.stringify({ x402Url: "ftp://files.example/a" }), error: "invalid_input" },
      {
        body: JSON.stringify({ x402Url: `https://example.com/${"a".repeat(2048)}` }),
        error: "invalid_input",
      },
      { body: JSON.stringify({ payTo: "0xabc" }), error: "invalid_input" },
      {
        body: JSON.stringify({ payTo: "0xAbCdEf0000000000000000000000000000000000" }),
        error: "invalid_input",
      },
      { body: JSON.stringify({ extra: true }), error: "invalid_input" },
    ];
    for (const item of cases) {
      const response = await app.request("http://127.0.0.1/v1/preflight/passive", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: item.body,
      });
      expect(response.status).toBe(400);
      expect(response.headers.get("payment-required")).toBeNull();
      const payload = (await response.json()) as { error: string };
      expect(payload.error).toBe(item.error);
    }
  });

  it("accepts a lowercase payTo and still refuses to settle when x402 is not configured", async () => {
    const app = createApp(loadConfig({}));
    const response = await app.request("http://127.0.0.1/v1/preflight/passive", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ payTo: `0x${"ab".repeat(20)}`, network: "testnet" }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("payment-required")).toBeNull();
  });

  it("rejects a body over 16 KB before payment", async () => {
    const app = createApp(loadConfig({}));
    const response = await app.request("http://127.0.0.1/v1/preflight/passive", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: `{"x402Url":"https://example.com/${"a".repeat(20_000)}"}`,
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("payment-required")).toBeNull();
  });

  it("returns a v2 PAYMENT-REQUIRED challenge", async () => {
    const signerKey = generatePrivateKey();
    const seller = privateKeyToAccount(generatePrivateKey());
    const app = createApp(
      loadConfig({
        SELLER_PAY_TO: seller.address,
        X402_API_KEY: "test-key",
        PUBLIC_BASE_URL: "https://preflight.example",
      }),
      { signer: createEip191ReportSigner(signerKey), syncFacilitatorOnStart: true },
    );

    const response = await app.request("http://127.0.0.1/v1/preflight/passive", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(402);
    const encoded = response.headers.get("payment-required") ?? response.headers.get("x-payment");
    expect(encoded).toBeTruthy();
    const challenge = JSON.parse(Buffer.from(encoded ?? "", "base64").toString("utf8")) as {
      x402Version: number;
      resource: { url: string };
      accepts: {
        scheme: string;
        network: string;
        amount: string;
        asset: string;
        payTo: string;
        extra: { name: string; version: string };
      }[];
    };
    expect(challenge.x402Version).toBe(2);
    expect(challenge.accepts[0]?.scheme).toBe("exact");
    expect(challenge.accepts[0]?.network).toBe("eip155:11142220");
    expect(challenge.accepts[0]?.amount).toBe("10000");
    expect(challenge.accepts[0]?.asset.toLowerCase()).toBe(
      "0x01c5c0122039549ad1493b8220cabedd739bc44e",
    );
    expect(challenge.accepts[0]?.payTo).toBe(seller.address);
    expect(challenge.accepts[0]?.extra).toMatchObject({ name: "USDC", version: "2" });
  });
});
