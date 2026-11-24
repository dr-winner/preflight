import { fromDataSuffix } from "@celo/attribution-tags";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Hex } from "@preflight/core";
import { createTagDecoder } from "./tags.js";

function load(name: string): { hash: string; input: Hex } {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as {
    hash: string;
    input: Hex;
  };
}

describe("tag decoder", () => {
  const decoder = createTagDecoder();

  it("decodes both Mondeto mainnet transactions to celo_ce264747447f", () => {
    for (const name of ["mondeto-update-profile.json", "mondeto-buy-pixels.json"]) {
      const tx = load(name);
      expect(decoder.decode(tx.input)).toEqual({
        codes: ["celo_ce264747447f"],
        schemaId: 0,
        via: "suffix",
      });
    }
  });

  it("finds the marker when the tag is not at the end of the input", () => {
    const tx = load("mondeto-buy-pixels.json");
    const buried = `${tx.input}deadbeef` as Hex;
    expect(fromDataSuffix(buried)).toBeNull();
    expect(decoder.decode(buried)).toEqual({
      codes: ["celo_ce264747447f"],
      schemaId: 0,
      via: "marker",
    });
  });
});
