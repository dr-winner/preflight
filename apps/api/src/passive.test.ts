import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createEip191ReportSigner } from "./report/signer.js";

describe("POST /v1/preflight/passive", () => {
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
