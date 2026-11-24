/**
 * ABIs copied from cited sources. Do not extend them from memory.
 *
 * - ERC-8004 reads: erc-8004/erc-8004-contracts `abis/IdentityRegistry.json`
 * - Self reads: selfxyz/self-agent-id `SelfAgentRegistry.sol` (`getAgentId`, `isVerifiedAgent`, `isProofFresh`)
 * - Altana reads: altananetwork/altana-sdk `packages/hypersigner-keystore-mcp/src/keystore.ts`
 * - Transfer: ERC-20 event whose topic is given in docs/SPEC.md §1
 * - Fill: UniswapX event in docs/SPEC.md §1, topic confirmed on Textile tx
 *   0x6bd2226f9a1b6572bf18f6aee75180020e8c5376dc23327394d44a3e9e9d0e71
 */

export const identityRegistryAbi = [
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }],
    name: "getAgentWallet",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const selfRegistryAbi = [
  {
    type: "function",
    name: "getAgentId",
    stateMutability: "view",
    inputs: [{ name: "agentKey", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isVerifiedAgent",
    stateMutability: "view",
    inputs: [{ name: "agentKey", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isProofFresh",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const keyStoreAbi = [
  {
    type: "function",
    stateMutability: "view",
    name: "getKeys",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "isValidKey",
    inputs: [
      { name: "user", type: "address" },
      { name: "keyId", type: "bytes32" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "getKey",
    inputs: [
      { name: "user", type: "address" },
      { name: "keyId", type: "bytes32" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "validator", type: "address" },
          { name: "publicKey", type: "bytes" },
          { name: "metadata", type: "bytes" },
          { name: "nonce", type: "uint64" },
          { name: "lastUpdated", type: "uint64" },
          { name: "revoked", type: "bool" },
          { name: "expiry", type: "uint40" },
          { name: "isRoot", type: "bool" },
        ],
      },
    ],
  },
] as const;

export const erc20TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

export const textileFillEvent = {
  type: "event",
  name: "Fill",
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "filler", type: "address", indexed: true },
    { name: "swapper", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
  ],
} as const;

/** EIP-3009 selectors from docs/SPEC.md §1. The bytes overload is recognized, not re-derived here. */
export const EIP3009_SELECTORS = ["0xe3ee160e", "0xcf092995"] as const;
