import { fromEntryPointCalldata } from "@celo/attribution-tags";
import type { Hex } from "@preflight/core";
import { getAddress } from "viem";
import type { DecodedUserOp, UserOpTagDecoder } from "./extensions.js";

export function createUserOpTagDecoder(): UserOpTagDecoder {
  return {
    decode(input: Hex): readonly DecodedUserOp[] | null {
      try {
        const ops = fromEntryPointCalldata(input);
        if (ops === null) {
          return null;
        }
        return ops.map((op) => ({
          sender: getAddress(op.sender),
          codes: op.attribution?.codes ?? [],
          schemaId: op.attribution?.schemaId ?? null,
        }));
      } catch {
        return null;
      }
    },
  };
}
