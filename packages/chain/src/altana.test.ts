import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainnet } from "@preflight/config";
import type { Address, Hex } from "@preflight/core";
import { createAltanaReader } from "./altana.js";

interface RecordedKey {
  keyId: Hex;
  validator: Address;
  publicKey: Hex;
  metadata: Hex;
  nonce: string;
  lastUpdated: string;
  revoked: boolean;
  expiry: number;
  isRoot: boolean;
}

describe("Altana reader", () => {
  const fixture = JSON.parse(
    readFileSync(new URL("../fixtures/altana-mainnet.json", import.meta.url), "utf8"),
  ) as {
    user: Address;
    keyId: Hex;
    getKeys: Hex[];
    getKey: RecordedKey;
    isValidKey: boolean;
  };

  it("returns the recorded mainnet key", async () => {
    const reader = createAltanaReader({
      network: "mainnet",
      keyStore: mainnet.altanaKeyStore,
      read: {
        readContract: ({ functionName }) => {
          if (functionName === "getKeys") {
            return Promise.resolve(fixture.getKeys);
          }
          if (functionName === "isValidKey") {
            return Promise.resolve(fixture.isValidKey);
          }
          return Promise.resolve({
            ...fixture.getKey,
            nonce: BigInt(fixture.getKey.nonce),
            lastUpdated: BigInt(fixture.getKey.lastUpdated),
          });
        },
      },
    });

    expect(await reader.getKeys(fixture.user)).toEqual(fixture.getKeys);
    expect(await reader.isValidKey(fixture.user, fixture.keyId)).toBe(fixture.isValidKey);
    const key = await reader.getKey(fixture.user, fixture.keyId);
    expect(key.isRoot).toBe(fixture.getKey.isRoot);
    expect(key.revoked).toBe(fixture.getKey.revoked);
    expect(key.expiry).toBe(fixture.getKey.expiry);
    expect(key.validator).toBe(fixture.getKey.validator);
  });
});
