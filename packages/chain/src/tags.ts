import { ERC_8021_MARKER, fromDataSuffix } from "@celo/attribution-tags";
import type { DecodedTag, Hex, TagDecoder } from "@preflight/core";

const MARKER_HEX = ERC_8021_MARKER.slice(2).toLowerCase();

function asHex(value: string): Hex {
  return value.startsWith("0x") ? (value as Hex) : (`0x${value}` as Hex);
}

/**
 * Outer `fromDataSuffix`, then the same marker scan `@celo/attribution-tags` uses
 * for calldata that does not end on the marker (Altana relay batches).
 */
export function createTagDecoder(): TagDecoder {
  return {
    marker: ERC_8021_MARKER,
    decode(input: Hex): DecodedTag | null {
      const direct = fromDataSuffix(input);
      if (direct) {
        return { codes: direct.codes, schemaId: direct.schemaId, via: "suffix" };
      }

      const hex = input.toLowerCase();
      let at = hex.indexOf(MARKER_HEX, 2);
      while (at !== -1) {
        const end = at + MARKER_HEX.length;
        if (end % 2 === 0) {
          const decoded = fromDataSuffix(asHex(hex.slice(0, end)));
          if (decoded) {
            return { codes: decoded.codes, schemaId: decoded.schemaId, via: "marker" };
          }
        }
        at = hex.indexOf(MARKER_HEX, at + 1);
      }

      return null;
    },
  };
}
