import type { Address, Erc8004Reader, NetworkName } from "@preflight/core";
import { getAddress } from "viem";
import { identityRegistryAbi } from "./abi.js";
import type { ContractReader } from "./read.js";

function asAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`${label} did not return an address`);
  }
  return getAddress(value);
}

function asBigint(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") {
    throw new Error(`${label} did not return a uint256`);
  }
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} did not return a string`);
  }
  return value;
}

export function createErc8004Reader(options: {
  network: NetworkName;
  registry: Address;
  read: ContractReader;
}): Erc8004Reader {
  const { network, registry, read } = options;
  const call = (functionName: string, args: readonly unknown[]) =>
    read.readContract({ address: registry, abi: identityRegistryAbi, functionName, args });

  return {
    network,
    registry,
    async ownerOf(agentId) {
      return asAddress(await call("ownerOf", [agentId]), "ownerOf");
    },
    async getAgentWallet(agentId) {
      return asAddress(await call("getAgentWallet", [agentId]), "getAgentWallet");
    },
    async tokenURI(agentId) {
      return asString(await call("tokenURI", [agentId]), "tokenURI");
    },
    async balanceOf(owner) {
      return asBigint(await call("balanceOf", [owner]), "balanceOf");
    },
  };
}
