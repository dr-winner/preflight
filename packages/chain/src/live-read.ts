import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, getAddress, http } from "viem";
import { mainnet, testnet } from "@preflight/config";
import type { TxHash } from "@preflight/core";
import { createAltanaReader } from "./altana.js";
import { createErc8004Reader } from "./erc8004.js";
import { contractReader } from "./read.js";
import { createSelfReader } from "./self.js";
import { createTagDecoder } from "./tags.js";
import { createTextileReader } from "./textile.js";
import { createX402SettlementReader } from "./x402.js";

const ERC8004_AGENT_ID = 10090n;
const ALTANA_USER = "0x65b6be7f24ab649267a4f2e5ac4fbf1b16b31140";
const ALTANA_KEY = "0x371e65b0b727c8686f99ca6d5a4a8fe43ab5a1fe3156fb5c63cf36c2ba37bb9d";
const SELF_AGENT = "5";
const X402_HASH = "0xbdeb35760a5fabc9d43a2ae48cac77163ab736bf31debefa336006ff8b4aa7b5" as TxHash;
const TEXTILE_HASH = "0x6bd2226f9a1b6572bf18f6aee75180020e8c5376dc23327394d44a3e9e9d0e71" as TxHash;
const MONDETO_HASH = "0xfe554ab86bf3fcd29b56d148f906ac94f05f5e1d415912a7bf371cef2c74b881" as TxHash;

function json(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

const mainClient = createPublicClient({ transport: http(mainnet.rpcUrl) });
const sepoliaClient = createPublicClient({ transport: http(testnet.rpcUrl) });

const erc8004 = createErc8004Reader({
  network: "mainnet",
  registry: mainnet.erc8004Identity,
  read: contractReader(mainClient),
});
const self = createSelfReader({
  network: "testnet",
  chainId: testnet.chainId,
  registry: testnet.selfAgentRegistry,
  read: contractReader(sepoliaClient),
});
const x402 = createX402SettlementReader({ table: mainnet });
const altana = createAltanaReader({
  network: "mainnet",
  keyStore: mainnet.altanaKeyStore,
  read: contractReader(mainClient),
});
const textile = createTextileReader({ table: mainnet });
const tags = createTagDecoder();

const owner = await erc8004.ownerOf(ERC8004_AGENT_ID);
const agentWallet = await erc8004.getAgentWallet(ERC8004_AGENT_ID);
const tokenUri = await erc8004.tokenURI(ERC8004_AGENT_ID);
const balance = await erc8004.balanceOf(owner);

const selfInfo = await self.getAgentInfo(SELF_AGENT);
const selfAgents = await self.getAgentsByAddress(
  getAddress("0xA7F2B8A0Ba50b099Ee2ad16A91176bED96E103F7"),
);
const selfOnchainId = await self.getAgentId(
  getAddress("0xA7F2B8A0Ba50b099Ee2ad16A91176bED96E103F7"),
);
const selfVerified = await self.isVerifiedAgent(
  "0x000000000000000000000000a7f2b8a0ba50b099ee2ad16a91176bed96e103f7",
);
const selfFresh = await self.isProofFresh(selfOnchainId);

const x402Tx = await mainClient.getTransaction({ hash: X402_HASH });
const x402Class = await x402.classifySettlement({
  hash: x402Tx.hash,
  from: x402Tx.from,
  to: x402Tx.to,
  input: x402Tx.input,
});
const signers = await x402.getFacilitatorSigners();

const keys = await altana.getKeys(ALTANA_USER);
const key = await altana.getKey(ALTANA_USER, ALTANA_KEY);
const valid = await altana.isValidKey(ALTANA_USER, ALTANA_KEY);

const textileTx = await mainClient.getTransaction({ hash: TEXTILE_HASH });
const textileReceipt = await mainClient.getTransactionReceipt({ hash: TEXTILE_HASH });
const textileClass = await textile.classify({
  hash: textileTx.hash,
  from: textileTx.from,
  to: textileTx.to,
  input: textileTx.input,
  status: textileReceipt.status === "success" ? "success" : "reverted",
  logs: textileReceipt.logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
  })),
});

const mondeto = await mainClient.getTransaction({ hash: MONDETO_HASH });
const mondetoTag = tags.decode(mondeto.input);

const report = {
  erc8004: {
    agentId: ERC8004_AGENT_ID.toString(),
    owner,
    agentWallet,
    tokenUri,
    balanceOfOwner: balance.toString(),
  },
  self: {
    info: selfInfo,
    agentsByAddress: selfAgents,
    onchainAgentId: selfOnchainId.toString(),
    isVerifiedAgent: selfVerified,
    isProofFresh: selfFresh,
  },
  x402: { signers, settlement: x402Class },
  altana: { user: getAddress(ALTANA_USER), keys, key, isValidKey: valid },
  textile: textileClass,
  tag: { hash: MONDETO_HASH, decoded: mondetoTag },
};

mkdirSync(new URL("../fixtures", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../fixtures/erc8004-mainnet.json", import.meta.url),
  `${json({
    source: "IdentityRegistry reads on https://forno.celo.org via createErc8004Reader",
    agentId: ERC8004_AGENT_ID.toString(),
    owner,
    calls: {
      ownerOf: owner,
      getAgentWallet: agentWallet,
      tokenURI: tokenUri,
      balanceOf: balance.toString(),
    },
  })}\n`,
);
writeFileSync(
  new URL("../fixtures/altana-mainnet.json", import.meta.url),
  `${json({
    source: "KeyStore reads on https://forno.celo.org via createAltanaReader",
    user: getAddress(ALTANA_USER),
    keyId: ALTANA_KEY,
    getKeys: keys,
    getKey: key,
    isValidKey: valid,
  })}\n`,
);

console.log(json(report));
