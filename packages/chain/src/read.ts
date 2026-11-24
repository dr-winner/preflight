import type { Address } from "@preflight/core";
import type { PublicClient } from "viem";

export interface ContractReader {
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

export function contractReader(client: PublicClient): ContractReader {
  return {
    readContract(args) {
      return client.readContract({
        address: args.address,
        abi: args.abi,
        functionName: args.functionName,
        args: args.args,
      } as never);
    },
  };
}
