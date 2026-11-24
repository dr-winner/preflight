import type { Address, NetworkName } from "@preflight/core";

/**
 * Verified constants from docs/SPEC.md §1 (fetched 24 Nov 2026).
 * Forno `eth_getLogs` spans are the live limits from §11.18:
 * mainnet rejects `toBlock - fromBlock` above 5000, Sepolia above 100000.
 */

export interface X402Asset {
  symbol: string;
  address: Address;
  name: string;
  version: string;
  decimals: number;
  transfer: "eip3009" | "permit2";
}

export interface CorridorToken {
  symbol: string;
  address: Address;
  decimals: number;
}

export interface NetworkTable {
  name: NetworkName;
  chainId: 42220 | 11142220;
  caip2: "eip155:42220" | "eip155:11142220";
  rpcUrl: string;
  blockscoutApi: string;
  blockscoutV2: string;
  /** Maximum `toBlock - fromBlock` accepted by forno `eth_getLogs`. */
  getLogsMaxBlockSpan: number;
  facilitatorUrl: string;
  erc8004Identity: Address;
  erc8004Reputation: Address;
  selfAgentRegistry: Address;
  selfHumanProofProvider: Address;
  altanaKeyStore: Address;
  altanaKeyStoreController: Address;
  altanaRelay: string;
  /** Null on testnet: Textile has no LimitOrderReactor on Celo Sepolia. */
  textileReactor: Address | null;
  permit2: Address;
  entryPointV06: Address | null;
  entryPointV07: Address | null;
  x402Assets: readonly X402Asset[];
  /** Fee-currency adapters. Never price a 402 against these. */
  feeCurrencyAdapters: readonly Address[];
  corridorTokens: readonly CorridorToken[];
  usdt: Address | null;
}

const MAINNET_ASSETS = [
  {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    name: "USDC",
    version: "2",
    decimals: 6,
    transfer: "eip3009",
  },
  {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    name: "Tether USD",
    version: "1",
    decimals: 6,
    transfer: "eip3009",
  },
  {
    symbol: "USAT",
    address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
    name: "Tether America USD",
    version: "1",
    decimals: 6,
    transfer: "eip3009",
  },
  {
    symbol: "wARS",
    address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
    name: "Peso Argentino",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "wBRL",
    address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
    name: "Real Brasileño",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "wMXN",
    address: "0x337E7456B420bD3481e7FA61fA9850343d610d34",
    name: "Peso Mexicano",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "wCOP",
    address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
    name: "Peso Colombiano",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "wPEN",
    address: "0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE",
    name: "Sol Peruano",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "wCLP",
    address: "0x61D450a098b6a7f69fC4b98CE68198fe59768651",
    name: "Peso Chileno",
    version: "1",
    decimals: 18,
    transfer: "permit2",
  },
  {
    symbol: "cNGN",
    address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
    name: "cNGN",
    version: "1",
    decimals: 6,
    transfer: "permit2",
  },
] as const satisfies readonly X402Asset[];

const HACKATHON_CORRIDORS = [
  { symbol: "cNGN", address: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f", decimals: 6 },
  { symbol: "IDRX", address: "0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22", decimals: 2 },
  { symbol: "wARS", address: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D", decimals: 18 },
  { symbol: "wBRL", address: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0", decimals: 18 },
  { symbol: "wMXN", address: "0x337E7456B420bD3481e7FA61fA9850343d610d34", decimals: 18 },
  { symbol: "wCOP", address: "0x8a1D45e102e886510e891d2Ec656a708991e2D76", decimals: 18 },
] as const satisfies readonly CorridorToken[];

export const mainnet: NetworkTable = {
  name: "mainnet",
  chainId: 42220,
  caip2: "eip155:42220",
  rpcUrl: "https://forno.celo.org",
  blockscoutApi: "https://celo.blockscout.com/api",
  blockscoutV2: "https://celo.blockscout.com/api/v2",
  getLogsMaxBlockSpan: 5000,
  facilitatorUrl: "https://api.x402.celo.org",
  erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  selfAgentRegistry: "0xaC3DF9ABf80d0F5c020C06B04Cced27763355944",
  selfHumanProofProvider: "0x4b036aFD959B457A208F676cf44Ea3ef73Ea3E3d",
  altanaKeyStore: "0x83b30935f36d6ccf9B1ec3b5E47F2866b97cd27c",
  altanaKeyStoreController: "0x47bA5fc2A5b0CcB24BA3fAC9D4B59400eE9fd1D6",
  altanaRelay: "https://relay.altana.network",
  textileReactor: "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  entryPointV06: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  entryPointV07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  x402Assets: MAINNET_ASSETS,
  feeCurrencyAdapters: [
    "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72",
    "0x0357EE22278c922e1D36cFe6b899269b161880C4",
    "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  ],
  corridorTokens: HACKATHON_CORRIDORS,
  usdt: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
};

export const testnet: NetworkTable = {
  name: "testnet",
  chainId: 11142220,
  caip2: "eip155:11142220",
  rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
  blockscoutApi: "https://celo-sepolia.blockscout.com/api",
  blockscoutV2: "https://celo-sepolia.blockscout.com/api/v2",
  getLogsMaxBlockSpan: 100000,
  facilitatorUrl: "https://api.x402.sepolia.celo.org",
  erc8004Identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  erc8004Reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  selfAgentRegistry: "0x043DaCac8b0771DD5b444bCC88f2f8BBDBEdd379",
  selfHumanProofProvider: "0x5E61c3051Bf4115F90AacEAE6212bc419f8aBB6c",
  altanaKeyStore: "0xCC3df52B6aD826781AAD86EcEB1459ed0b1Ae3F6",
  altanaKeyStoreController: "0x54eAb49d805336DB8591BAAF9ac630D0A58Ad2cD",
  altanaRelay: "https://testnet-relay.altana.network",
  textileReactor: null,
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  entryPointV06: null,
  entryPointV07: null,
  x402Assets: [
    {
      symbol: "USDC",
      address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
      name: "USDC",
      version: "2",
      decimals: 6,
      transfer: "eip3009",
    },
  ],
  feeCurrencyAdapters: [],
  corridorTokens: [],
  usdt: null,
};

export const networks = {
  mainnet,
  testnet,
} as const;

export function networkTable(name: NetworkName): NetworkTable {
  return networks[name];
}
