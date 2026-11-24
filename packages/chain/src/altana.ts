import type { Address, AltanaKey, AltanaReader, Hex, NetworkName } from "@preflight/core";
import { getAddress } from "viem";
import { keyStoreAbi } from "./abi.js";
import type { ContractReader } from "./read.js";

function asHex(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`${label} did not return bytes`);
  }
  return value as Hex;
}

function asBigint(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  throw new Error(`${label} did not return an integer`);
}

function asKey(value: unknown, keyId: Hex): AltanaKey {
  if (typeof value !== "object" || value === null) {
    throw new Error("getKey did not return a struct");
  }
  const record = value as Record<string, unknown>;
  const validator = record.validator;
  if (typeof validator !== "string" || !validator.startsWith("0x")) {
    throw new Error("getKey.validator is not an address");
  }
  if (typeof record.revoked !== "boolean" || typeof record.isRoot !== "boolean") {
    throw new Error("getKey flags are not booleans");
  }
  return {
    keyId,
    validator: getAddress(validator),
    publicKey: asHex(record.publicKey, "getKey.publicKey"),
    metadata: asHex(record.metadata, "getKey.metadata"),
    nonce: asBigint(record.nonce, "getKey.nonce"),
    lastUpdated: asBigint(record.lastUpdated, "getKey.lastUpdated"),
    revoked: record.revoked,
    expiry: Number(asBigint(record.expiry, "getKey.expiry")),
    isRoot: record.isRoot,
  };
}

export function createAltanaReader(options: {
  network: NetworkName;
  keyStore: Address;
  read: ContractReader;
}): AltanaReader {
  const { network, keyStore, read } = options;
  return {
    network,
    keyStore,
    async getKeys(user) {
      const value = await read.readContract({
        address: keyStore,
        abi: keyStoreAbi,
        functionName: "getKeys",
        args: [user],
      });
      if (!Array.isArray(value)) {
        throw new Error("getKeys did not return an array");
      }
      return value.map((item) => asHex(item, "getKeys"));
    },
    async getKey(user, keyId) {
      const value = await read.readContract({
        address: keyStore,
        abi: keyStoreAbi,
        functionName: "getKey",
        args: [user, keyId],
      });
      return asKey(value, keyId);
    },
    async isValidKey(user, keyId) {
      const value = await read.readContract({
        address: keyStore,
        abi: keyStoreAbi,
        functionName: "isValidKey",
        args: [user, keyId],
      });
      if (typeof value !== "boolean") {
        throw new Error("isValidKey did not return a bool");
      }
      return value;
    },
  };
}
