import type { Address } from "@preflight/core";
import type { EntryInput } from "./input.js";

export function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function dedupeAddresses(addresses: readonly Address[]): Address[] {
  const seen = new Set<string>();
  const unique: Address[] = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(address);
  }
  return unique;
}

/** Wallets whose outgoing transactions G3 inspects. */
export function attributionWallets(input: EntryInput): Address[] {
  return dedupeAddresses([input.agentWallet, ...(input.teamWallets ?? [])]);
}

/** Team set used when deciding which side of a payment the entry is on. */
export function teamAddresses(input: EntryInput): Set<string> {
  const set = new Set<string>();
  set.add(input.agentWallet.toLowerCase());
  for (const wallet of input.teamWallets ?? []) {
    set.add(wallet.toLowerCase());
  }
  if (input.payTo !== undefined) {
    set.add(input.payTo.toLowerCase());
  }
  if (input.altanaWallet !== undefined) {
    set.add(input.altanaWallet.toLowerCase());
  }
  return set;
}
