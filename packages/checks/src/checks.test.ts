import { codeFromRepo, toDataSuffix } from "@celo/attribution-tags";
import { createTagDecoder } from "@preflight/chain";
import { mainnet } from "@preflight/config";
import type {
  Address,
  AltanaKey,
  AltanaReader,
  Erc8004Reader,
  Hex,
  SelfAgentInfo,
  SelfReader,
  TxHash,
  X402SettlementReader,
} from "@preflight/core";
import { describe, expect, it } from "vitest";
import { checkAltanaRevoked, checkAltanaSession, checkAltanaWallet } from "./checks/altana.js";
import { checkAttributionTags } from "./checks/attribution.js";
import { checkMainnetActivity } from "./checks/activity.js";
import { checkErc8004Registered, checkErc8004WalletMatch } from "./checks/erc8004.js";
import { checkPayToRegistered } from "./checks/manual.js";
import { checkX402Payment } from "./checks/payment.js";
import { checkCodeWindow, checkRepoPublic } from "./checks/repo.js";
import { checkSelfAgentMainnet, checkSelfRecommended } from "./checks/self.js";
import type { CheckResult } from "./run.js";
import type { EntryInput } from "./input.js";
import { EntryInputError, parseEntryInput } from "./input.js";
import { expectedAttributionCode } from "./github.js";
import { CheckSourceError } from "./read.js";
import { createReportId, splitPublicReportId } from "./report.js";
import type {
  GithubReader,
  OutgoingTransaction,
  PaymentTransaction,
  PaymentTxReader,
  TxHistoryReader,
} from "./extensions.js";
import { createUserOpTagDecoder } from "./user-ops.js";

type Assert<T extends true> = T;
type PassObserved = Assert<
  Extract<CheckResult, { status: "pass" }>["evidence"] extends { readonly observed: true }
    ? true
    : false
>;
type WarnObserved = Assert<
  Extract<CheckResult, { status: "warn" }>["evidence"] extends { readonly observed: true }
    ? true
    : false
>;
type FailUnobserved = Assert<
  Extract<CheckResult, { status: "fail" }>["evidence"] extends { readonly observed: false }
    ? true
    : false
>;
type UnknownUnobserved = Assert<
  Extract<CheckResult, { status: "unknown" }>["evidence"] extends { readonly observed: false }
    ? true
    : false
>;
const evidenceGuards: [PassObserved, WarnObserved, FailUnobserved, UnknownUnobserved] = [
  true,
  true,
  true,
  true,
];
void evidenceGuards;

const AGENT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x6666666666666666666666666666666666666666" as Address;
const ALTANA = "0x4444444444444444444444444444444444444444" as Address;
const PAYTO = "0x3333333333333333333333333333333333333333" as Address;
const FACILITATOR = "0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48" as Address;
const CODE = "celo_a1dce2bb4c45";
const NOW = new Date("2026-11-24T12:00:00.000Z");
const tags = createTagDecoder();
const userOps = createUserOpTagDecoder();

function entry(overrides: Partial<EntryInput> = {}): EntryInput {
  const parsed = parseEntryInput({
    network: "mainnet",
    tracks: ["t3", "t4"],
    agentWallet: AGENT,
    attributionCode: CODE,
    ...overrides,
  });
  return parsed;
}

function suffix(code: string | readonly string[]): Hex {
  const encoded = toDataSuffix(code);
  return `0x1234${encoded.slice(2)}`;
}

function outgoing(hash: string, input: Hex, from: Address = AGENT, index = 0): OutgoingTransaction {
  return {
    hash: hash as TxHash,
    from,
    to: AGENT,
    input,
    blockNumber: "100",
    index,
    status: "success",
  };
}

function history(
  txs: readonly OutgoingTransaction[],
  network: TxHistoryReader["network"] = "mainnet",
): TxHistoryReader {
  return {
    network,
    listOutgoing: () => Promise.resolve(txs),
    transactionCount: () => Promise.resolve(BigInt(txs.length)),
    hasTokenTransfers: () => Promise.resolve(false),
  };
}

function x402(
  classify: X402SettlementReader["classifySettlement"] = () => Promise.resolve(null),
): X402SettlementReader {
  return {
    network: "mainnet",
    getFacilitatorSigners: () => Promise.resolve([FACILITATOR]),
    classifySettlement: classify,
  };
}

function downErc8004(): Erc8004Reader {
  const fail = () => Promise.reject(new Error("rpc down"));
  return {
    network: "mainnet",
    registry: mainnet.erc8004Identity,
    ownerOf: fail,
    getAgentWallet: fail,
    tokenURI: fail,
    balanceOf: fail,
  };
}

function selfNone(): SelfReader {
  return {
    network: "mainnet",
    chainId: 42220,
    registry: mainnet.selfAgentRegistry,
    getAgentInfo: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    getAgentsByAddress: () => Promise.resolve([]),
    getAgentId: () => Promise.resolve(0n),
    isVerifiedAgent: () => Promise.resolve(false),
    isProofFresh: () => Promise.resolve(false),
  };
}

describe("attribution code", () => {
  it("matches the published codeFromRepo example and prefers a supplied code", () => {
    expect(codeFromRepo("dr-winner/preflight")).toBe(CODE);
    const derived = expectedAttributionCode({
      network: "mainnet",
      tracks: ["t3"],
      agentWallet: AGENT,
      repoUrl: "https://github.com/dr-winner/preflight",
    });
    expect(derived).toEqual({ state: "code", code: CODE, source: "repo" });
    const supplied = expectedAttributionCode(entry({ attributionCode: "celo_bbbbbbbbbbbb" }));
    expect(supplied).toEqual({ state: "code", code: "celo_bbbbbbbbbbbb", source: "input" });
  });
});

describe("entry input", () => {
  it("rejects an address that is not an address", () => {
    expect(() => parseEntryInput({ agentWallet: "not-an-address" })).toThrow(EntryInputError);
  });
});

describe("report ids", () => {
  it("builds a UUIDv7 plus 128 bits and splits it back", () => {
    const entropy = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
    const id = createReportId(Date.parse("2026-11-24T12:00:00.000Z"), entropy);
    const split = splitPublicReportId(id);
    expect(split).not.toBeNull();
    expect(split?.id[14]).toBe("7");
    expect(split?.suffix).toHaveLength(32);
  });
});

describe("G1 erc8004.registered", () => {
  it("is unknown when the registry and Self API both fail", async () => {
    const self = selfNone();
    self.getAgentsByAddress = () => Promise.reject(new Error("self down"));
    const result = await checkErc8004Registered(entry(), downErc8004(), self, {});
    expect(result.status).toBe("unknown");
  });

  it("warns when only a Self agent exists", async () => {
    const erc8004 = downErc8004();
    erc8004.balanceOf = () => Promise.resolve(0n);
    const self = selfNone();
    self.getAgentsByAddress = () =>
      Promise.resolve([
        {
          agentId: "5",
          agentAddress: AGENT,
          chainId: 42220,
          isVerified: true,
          hasHumanProof: true,
          isProofFresh: true,
          proofExpiresAt: null,
          proofProvider: null,
          verificationStrength: 100,
          strengthLabel: "passport",
          network: "mainnet",
        },
      ]);
    const result = await checkErc8004Registered(entry(), erc8004, self, {});
    expect(result.status).toBe("warn");
    expect(result.hint).toContain(mainnet.erc8004Identity);
  });

  it("fails when neither registry has an identity", async () => {
    const erc8004 = downErc8004();
    erc8004.balanceOf = () => Promise.resolve(0n);
    const result = await checkErc8004Registered(entry(), erc8004, selfNone(), {});
    expect(result.status).toBe("fail");
  });
});

describe("G2 erc8004.wallet_match", () => {
  it("fails when the owner and agent wallet are both someone else", async () => {
    const erc8004 = downErc8004();
    erc8004.ownerOf = () => Promise.resolve(OTHER);
    erc8004.getAgentWallet = () => Promise.resolve(OTHER);
    erc8004.tokenURI = () => Promise.resolve("https://example.com/agent.json");
    const result = await checkErc8004WalletMatch(
      entry({ erc8004AgentId: "7" }),
      erc8004,
      undefined,
    );
    expect(result.status).toBe("fail");
    expect(result.hint).toContain("setAgentWallet");
  });

  it("is unknown when the read fails", async () => {
    const result = await checkErc8004WalletMatch(
      entry({ erc8004AgentId: "7" }),
      downErc8004(),
      undefined,
    );
    expect(result.status).toBe("unknown");
  });
});

describe("G3 attribution.tags", () => {
  async function run(txs: readonly OutgoingTransaction[], input = entry()) {
    return checkAttributionTags(input, history(txs), x402(), tags, userOps);
  }

  it("passes when the first transaction carries the expected code", async () => {
    const result = await run([outgoing("0x" + "c".repeat(64), suffix(CODE))]);
    expect(result.status).toBe("pass");
  });

  it("warns when a different celo_ code is present", async () => {
    const result = await run([outgoing("0x" + "d".repeat(64), suffix("celo_bbbbbbbbbbbb"))]);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("Leaderboards only credit the assigned code");
  });

  it("warns when untagged transactions sit before the first tagged one", async () => {
    const result = await run([
      outgoing("0x" + "a".repeat(64), "0x1234", AGENT, 0),
      outgoing("0x" + "b".repeat(64), suffix(CODE), AGENT, 1),
    ]);
    expect(result.status).toBe("warn");
    expect(result.hint).toContain("can never be credited");
  });

  it("fails when a later transaction drops the code", async () => {
    const result = await run([
      outgoing("0x" + "a".repeat(64), suffix(CODE), AGENT, 0),
      outgoing("0x" + "b".repeat(64), "0x1234", AGENT, 1),
    ]);
    expect(result.status).toBe("fail");
  });

  it("fails when nothing is tagged", async () => {
    const result = await run([outgoing("0x" + "a".repeat(64), "0x1234")]);
    expect(result.status).toBe("fail");
  });

  it("is unknown when the wallet has no mainnet transactions", async () => {
    const result = await run([]);
    expect(result.status).toBe("unknown");
  });

  it("is unknown when the explorer fails", async () => {
    const broken = history([]);
    broken.listOutgoing = () => Promise.reject(new Error("blockscout down"));
    const result = await checkAttributionTags(entry(), broken, x402(), tags, userOps);
    expect(result.status).toBe("unknown");
  });

  it("credits a handleOps user operation sent by the entry wallet", async () => {
    const hash = ("0x" + "e".repeat(64)) as TxHash;
    const result = await checkAttributionTags(
      entry(),
      history([outgoing(hash, "0x1fad948cdead")]),
      x402(),
      { marker: tags.marker, decode: () => null },
      {
        decode: () => [{ sender: AGENT, codes: [CODE], schemaId: 0 }],
      },
    );
    expect(result.status).toBe("pass");
  });
});

describe("G4 and G5 repo", () => {
  function github(repo: GithubReader["repo"], commits = 0): GithubReader {
    return {
      repo,
      commitsBefore: () => Promise.resolve(commits),
    };
  }

  it("passes a public repo with no pre-window commits", async () => {
    const source = github(async () => ({
      state: "public",
      fork: false,
      createdAt: "2026-11-21T00:00:00.000Z",
    }));
    const input = entry({ repoUrl: "https://github.com/example/agent" });
    expect((await checkRepoPublic(input, source)).status).toBe("pass");
    expect((await checkCodeWindow(input, source)).status).toBe("pass");
  });

  it("fails a private repo and a missing repo, and never fails the code window", async () => {
    const input = entry({ repoUrl: "https://github.com/example/agent" });
    const priv = github(async () => ({
      state: "private",
      fork: false,
      createdAt: "2026-11-21T00:00:00.000Z",
    }));
    expect((await checkRepoPublic(input, priv)).status).toBe("fail");
    const missing = github(async () => ({ state: "missing" }));
    expect((await checkRepoPublic(input, missing)).status).toBe("fail");
    const old = github(
      async () => ({ state: "public", fork: true, createdAt: "2020-01-01T00:00:00.000Z" }),
      4,
    );
    const window = await checkCodeWindow(input, old);
    expect(window.status).toBe("warn");
    expect(window.hint).toContain("20 Nov");
  });

  it("is unknown when GitHub fails or the URL is absent", async () => {
    const down = github(() => Promise.reject(new Error("rate limit")));
    const input = entry({ repoUrl: "https://github.com/example/agent" });
    expect((await checkRepoPublic(input, down)).status).toBe("unknown");
    expect((await checkCodeWindow(entry(), down)).status).toBe("unknown");
  });
});

describe("G6 mainnet.activity", () => {
  it("fails a testnet reader and a wallet with no mainnet activity", async () => {
    const testnet = await checkMainnetActivity(
      entry({ network: "testnet" }),
      history([], "testnet"),
    );
    expect(testnet.status).toBe("fail");
    expect(testnet.hint).toBe("Only Celo mainnet counts");
    const empty = history([]);
    empty.transactionCount = () => Promise.resolve(0n);
    expect((await checkMainnetActivity(entry(), empty)).status).toBe("fail");
  });

  it("passes on token transfers when the nonce is zero, and is unknown when the read fails", async () => {
    const transfers = history([]);
    transfers.transactionCount = () => Promise.resolve(0n);
    transfers.hasTokenTransfers = () => Promise.resolve(true);
    expect((await checkMainnetActivity(entry(), transfers)).status).toBe("pass");
    const down = history([]);
    down.transactionCount = () => Promise.reject(new Error("rpc"));
    down.hasTokenTransfers = () => Promise.reject(new Error("rpc"));
    expect((await checkMainnetActivity(entry(), down)).status).toBe("unknown");
  });
});

describe("G7 payto", () => {
  it("is always unknown, including when payTo was supplied", () => {
    const result = checkPayToRegistered(entry({ payTo: PAYTO }));
    expect(result.status).toBe("unknown");
    if (result.status === "unknown") {
      expect(result.evidence.reason).toBe("manual");
      expect(result.evidence.comparedToLive402).toBe(false);
    }
  });
});

describe("G9 and T3.1 self", () => {
  function info(overrides: Partial<SelfAgentInfo> = {}): SelfAgentInfo {
    return {
      agentId: "42",
      agentAddress: AGENT,
      chainId: 42220,
      isVerified: true,
      hasHumanProof: true,
      isProofFresh: true,
      proofExpiresAt: "2027-06-01T00:00:00.000Z",
      proofProvider: mainnet.selfHumanProofProvider,
      verificationStrength: 100,
      strengthLabel: "passport",
      network: "mainnet",
      ...overrides,
    };
  }

  function reader(agent: SelfAgentInfo | "missing", chainId = 42220): SelfReader {
    return {
      network: chainId === 42220 ? "mainnet" : "testnet",
      chainId,
      registry: mainnet.selfAgentRegistry,
      getAgentInfo: () =>
        agent === "missing"
          ? Promise.reject(new CheckSourceError("not_found", "missing"))
          : Promise.resolve(agent),
      getAgentsByAddress: () => Promise.resolve(agent === "missing" ? [] : [agent]),
      getAgentId: () => Promise.resolve(42n),
      isVerifiedAgent: () => Promise.resolve(true),
      isProofFresh: () => Promise.resolve(true),
    };
  }

  it("warns when Self is missing and passes when the wallet maps to an agent", async () => {
    expect((await checkSelfRecommended(entry(), reader("missing"))).status).toBe("warn");
    expect((await checkSelfRecommended(entry(), reader(info()))).status).toBe("pass");
  });

  it("passes a fresh mainnet agent and warns inside 14 days", async () => {
    const input = entry({ selfAgentId: "42" });
    expect((await checkSelfAgentMainnet(input, reader(info()), NOW)).status).toBe("pass");
    const soon = info({ proofExpiresAt: "2026-11-30T00:00:00.000Z" });
    expect((await checkSelfAgentMainnet(input, reader(soon), NOW)).status).toBe("warn");
  });

  it("fails testnet, a missing id, and a stale proof, and is unknown when the API is down", async () => {
    expect((await checkSelfAgentMainnet(entry(), reader(info()), NOW)).status).toBe("fail");
    const testnet = await checkSelfAgentMainnet(
      entry({ selfAgentId: "5" }),
      reader(info({ chainId: 11142220, network: "testnet" }), 11142220),
      NOW,
    );
    expect(testnet.status).toBe("fail");
    expect(testnet.hint).toContain("mock passports");
    const stale = await checkSelfAgentMainnet(
      entry({ selfAgentId: "42" }),
      reader(info({ isProofFresh: false })),
      NOW,
    );
    expect(stale.status).toBe("fail");
    const down = reader(info());
    down.getAgentInfo = () => Promise.reject(new Error("timeout"));
    expect((await checkSelfAgentMainnet(entry({ selfAgentId: "42" }), down, NOW)).status).toBe(
      "unknown",
    );
  });
});

describe("T3.2 x402 payment", () => {
  function payment(
    tx: PaymentTransaction | null,
    network: PaymentTxReader["network"] = "mainnet",
  ): PaymentTxReader {
    return {
      network,
      getTransaction: () => Promise.resolve(tx),
    };
  }

  const settlement: PaymentTransaction = {
    hash: `0x${"a".repeat(64)}`,
    from: FACILITATOR,
    to: mainnet.usdt,
    input: "0xe3ee160e",
    status: "success",
    transfers: [{ token: mainnet.usdt ?? PAYTO, from: OTHER, to: PAYTO, value: "10000" }],
  };

  it("fails when no hash is submitted or the sender is not the facilitator", async () => {
    expect((await checkX402Payment(entry(), payment(null), x402())).status).toBe("fail");
    const direct = await checkX402Payment(
      entry({ x402PaymentTxs: [settlement.hash], payTo: PAYTO }),
      payment({ ...settlement, from: AGENT }),
      x402(),
    );
    expect(direct.status).toBe("fail");
  });

  it("is unknown for an unverified permit2 shape instead of passing", async () => {
    const tx: PaymentTransaction = {
      ...settlement,
      to: mainnet.permit2,
      input: "0x12345678",
    };
    const result = await checkX402Payment(
      entry({ x402PaymentTxs: [tx.hash] }),
      payment(tx),
      x402(),
    );
    expect(result.status).toBe("unknown");
    expect(JSON.stringify(result.evidence)).toContain("TODO(unverified)");
  });
});

describe("T4 altana", () => {
  function reader(keys: readonly AltanaKey[]): AltanaReader {
    return {
      network: "mainnet",
      keyStore: mainnet.altanaKeyStore,
      getKeys: () => Promise.resolve(keys.map((key) => key.keyId)),
      getKey: (_user, keyId) => {
        const key = keys.find((item) => item.keyId === keyId);
        return key === undefined
          ? Promise.reject(new CheckSourceError("not_found", "missing"))
          : Promise.resolve(key);
      },
      isValidKey: (_user, keyId) =>
        Promise.resolve(!keys.find((item) => item.keyId === keyId)?.revoked),
    };
  }

  function key(partial: Pick<AltanaKey, "keyId" | "isRoot" | "expiry" | "revoked">): AltanaKey {
    return {
      validator: AGENT,
      publicKey: "0x01",
      metadata: "0x",
      nonce: 0n,
      lastUpdated: 0n,
      ...partial,
    };
  }

  const root = key({
    keyId: `0x${"1".repeat(64)}`,
    isRoot: true,
    expiry: 0,
    revoked: false,
  });

  it("passes a root key and fails when the keystore is empty", async () => {
    expect((await checkAltanaWallet(entry({ altanaWallet: ALTANA }), reader([root]))).status).toBe(
      "pass",
    );
    expect((await checkAltanaWallet(entry({ altanaWallet: ALTANA }), reader([]))).status).toBe(
      "fail",
    );
    expect((await checkAltanaWallet(entry(), reader([root]))).status).toBe("unknown");
  });

  it("warns on an expired session and fails when expiry is zero", async () => {
    const past = key({
      keyId: `0x${"2".repeat(64)}`,
      isRoot: false,
      expiry: 1,
      revoked: false,
    });
    expect(
      (await checkAltanaSession(entry({ altanaWallet: ALTANA }), reader([root, past]), NOW)).status,
    ).toBe("warn");
    const zero = key({
      keyId: `0x${"3".repeat(64)}`,
      isRoot: false,
      expiry: 0,
      revoked: false,
    });
    expect(
      (await checkAltanaSession(entry({ altanaWallet: ALTANA }), reader([root, zero]), NOW)).status,
    ).toBe("fail");
  });

  it("passes a revoked session key and fails when none are revoked", async () => {
    const revoked = key({
      keyId: `0x${"4".repeat(64)}`,
      isRoot: false,
      expiry: 4_000_000_000,
      revoked: true,
    });
    expect(
      (
        await checkAltanaRevoked(
          entry({ altanaWallet: ALTANA }),
          reader([root, revoked]),
          undefined,
        )
      ).status,
    ).toBe("pass");
    const live = { ...revoked, revoked: false };
    expect(
      (await checkAltanaRevoked(entry({ altanaWallet: ALTANA }), reader([root, live]), undefined))
        .status,
    ).toBe("fail");
  });
});
