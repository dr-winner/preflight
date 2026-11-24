import type { Address, Hex, NetworkName, TxHash } from "@preflight/core";

/**
 * Reads the §2 checks need that `packages/core` readers do not expose.
 * Implementations stay outside this package. Tests pass fakes.
 */

/** Canonical-registry token ids owned by a wallet. `Erc8004Reader` has balanceOf, not enumeration. */
export interface OwnedTokenLookup {
  tokenIdsOf(owner: Address): Promise<readonly bigint[]>;
}

/** HTTPS or IPFS registration document for a tokenURI. data: URIs are parsed in-process. */
export interface RegistrationJsonReader {
  read(tokenUri: string): Promise<unknown>;
}

export interface OutgoingTransaction {
  hash: TxHash;
  from: Address;
  to: Address | null;
  input: Hex;
  blockNumber: string;
  index: number;
  status: "success" | "reverted";
}

/** Outgoing history, nonce, and token-transfer existence. Blockscout is not a core reader. */
export interface TxHistoryReader {
  readonly network: NetworkName;
  listOutgoing(address: Address): Promise<readonly OutgoingTransaction[]>;
  transactionCount(address: Address): Promise<bigint>;
  hasTokenTransfers(address: Address): Promise<boolean>;
}

export type GithubRepo =
  | { readonly state: "public"; readonly fork: boolean; readonly createdAt: string }
  | { readonly state: "private"; readonly fork: boolean; readonly createdAt: string }
  | { readonly state: "missing" };

export interface GithubReader {
  repo(owner: string, name: string): Promise<GithubRepo>;
  /** Commits whose author date is strictly before `instant` (ISO-8601). */
  commitsBefore(owner: string, name: string, instant: string): Promise<number>;
}

export interface TokenTransfer {
  token: Address;
  from: Address;
  to: Address;
  value: string;
}

export interface PaymentTransaction {
  hash: TxHash;
  from: Address;
  to: Address | null;
  input: Hex;
  status: "success" | "reverted";
  transfers: readonly TokenTransfer[];
}

/** Receipt fields T3.2 needs beyond `X402SettlementReader.classifySettlement`. */
export interface PaymentTxReader {
  readonly network: NetworkName;
  /** `null` when the hash is not on this network. Throw when the source is down. */
  getTransaction(hash: TxHash): Promise<PaymentTransaction | null>;
}

export interface TxReceipt {
  status: "success" | "reverted";
}

/** Optional receipt for `altanaRevokeTx`. Absence of this reader leaves that hash unchecked. */
export interface TxReceiptReader {
  readonly network: NetworkName;
  getReceipt(hash: TxHash): Promise<TxReceipt | null>;
}

export interface DecodedUserOp {
  sender: Address;
  codes: readonly string[];
  schemaId: number | null;
}

/**
 * EntryPoint `handleOps` decoding. `TagDecoder` only exposes suffix and marker-anywhere.
 * The default implementation uses `@celo/attribution-tags` `fromEntryPointCalldata`.
 */
export interface UserOpTagDecoder {
  decode(input: Hex): readonly DecodedUserOp[] | null;
}
