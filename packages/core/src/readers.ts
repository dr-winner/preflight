/**
 * Chain-reader contracts for the check engine.
 * Implementations live in `packages/chain`. Methods are reads only.
 */

export type NetworkName = "mainnet" | "testnet";

export type Address = `0x${string}`;

export type Hex = `0x${string}`;

export type TxHash = `0x${string}`;

export interface Erc8004Reader {
  readonly network: NetworkName;
  readonly registry: Address;
  ownerOf(agentId: bigint): Promise<Address>;
  getAgentWallet(agentId: bigint): Promise<Address>;
  tokenURI(agentId: bigint): Promise<string>;
  balanceOf(owner: Address): Promise<bigint>;
}

/** REST body from `GET /api/agent/info/{chainId}/{agentId}`, plus the chain id used. */
export interface SelfAgentInfo {
  agentId: string;
  agentAddress: Address | null;
  chainId: number;
  isVerified: boolean;
  hasHumanProof: boolean;
  isProofFresh: boolean;
  proofExpiresAt: string | null;
  proofProvider: string | null;
  /** Live `/info` returns a number (`100`) plus `strengthLabel`. Either form is accepted. */
  verificationStrength: string | number | null;
  strengthLabel: string | null;
  network: string | null;
}

export interface SelfReader {
  readonly network: NetworkName;
  readonly chainId: number;
  readonly registry: Address;
  getAgentInfo(agentId: string): Promise<SelfAgentInfo>;
  getAgentsByAddress(address: Address): Promise<readonly SelfAgentInfo[]>;
  getAgentId(agentAddress: Address): Promise<bigint>;
  isVerifiedAgent(agentKey: Hex): Promise<boolean>;
  isProofFresh(agentId: bigint): Promise<boolean>;
}

/** EIP-3009 facilitator settlement. Permit2 settlement shape is still unverified. */
export interface X402Settlement {
  hash: TxHash;
  from: Address;
  to: Address;
  selector: Hex;
  asset: Address;
  kind: "eip3009";
}

export interface X402SettlementReader {
  readonly network: NetworkName;
  /** Signers from the facilitator `GET /supported` response. Do not hard-code them. */
  getFacilitatorSigners(): Promise<readonly Address[]>;
  classifySettlement(tx: {
    hash: TxHash;
    from: Address;
    to: Address | null;
    input: Hex;
  }): Promise<X402Settlement | null>;
}

export interface AltanaKey {
  keyId: Hex;
  validator: Address;
  publicKey: Hex;
  metadata: Hex;
  nonce: bigint;
  lastUpdated: bigint;
  revoked: boolean;
  expiry: number;
  isRoot: boolean;
}

export interface AltanaReader {
  readonly network: NetworkName;
  readonly keyStore: Address;
  getKeys(user: Address): Promise<readonly Hex[]>;
  getKey(user: Address, keyId: Hex): Promise<AltanaKey>;
  isValidKey(user: Address, keyId: Hex): Promise<boolean>;
}

export interface TextileLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}

export interface TextileTransfer {
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
}

/**
 * `fill` is present only when a log matches the UniswapX `Fill` topic.
 * That topic is unverified against a real Celo Textile transaction until §11.4 is resolved.
 */
export interface TextileFill {
  orderHash: Hex;
  filler: Address;
  swapper: Address;
  nonce: bigint;
}

export interface TextileClassification {
  hash: TxHash;
  toReactor: boolean;
  success: boolean;
  from: Address;
  corridorToken: Address | null;
  touchesUsdt: boolean;
  transfers: readonly TextileTransfer[];
  fill: TextileFill | null;
}

export interface TextileReader {
  readonly network: NetworkName;
  /** `null` on testnet. Textile has no LimitOrderReactor on Celo Sepolia. */
  readonly reactor: Address | null;
  classify(tx: {
    hash: TxHash;
    from: Address;
    to: Address | null;
    input: Hex;
    status: "success" | "reverted";
    logs: readonly TextileLog[];
  }): Promise<TextileClassification>;
}

export interface DecodedTag {
  codes: readonly string[];
  schemaId: number | null;
  /** `suffix` is `@celo/attribution-tags` `fromDataSuffix`. `marker` searches the marker anywhere in the input. */
  via: "suffix" | "marker";
}

export interface TagDecoder {
  readonly marker: Hex;
  decode(input: Hex): DecodedTag | null;
}
