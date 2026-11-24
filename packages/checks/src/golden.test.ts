import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { toDataSuffix } from "@celo/attribution-tags";
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
  X402Settlement,
  X402SettlementReader,
} from "@preflight/core";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import type { EntryInput } from "./input.js";
import { parseEntryInput } from "./input.js";
import type {
  OutgoingTransaction,
  PaymentTransaction,
  PaymentTxReader,
  TxHistoryReader,
  TxReceiptReader,
} from "./extensions.js";
import { CheckSourceError } from "./read.js";
import { buildReport } from "./report.js";
import { runChecks, type CheckSources } from "./run.js";
import {
  createEip191ReportSigner,
  reportMessage,
  signReport,
  verifyReport,
  type SignedReport,
} from "./sign.js";
import { EIP8004_REGISTRATION_TYPE } from "./constants.js";

/** Public Anvil account zero. It is not a credential. https://book.getfoundry.sh/anvil/ */
const ANVIL_ACCOUNT = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER = privateKeyToAccount(ANVIL_ACCOUNT).address;
const NOW = "2026-11-24T12:00:00.000Z";
const CODE = "celo_a1dce2bb4c45";
const AGENT = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x6666666666666666666666666666666666666666" as Address;
const PAYTO = "0x3333333333333333333333333333333333333333" as Address;
const ALTANA = "0x4444444444444444444444444444444444444444" as Address;
const FACILITATOR = "0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48" as Address;
const PAYMENT = `0x${"a".repeat(64)}` as TxHash;
const BAD_PAYMENT = `0x${"e".repeat(64)}` as TxHash;
const AGENT_TX = `0x${"c".repeat(64)}` as TxHash;
const ALTANA_TX = `0x${"d".repeat(64)}` as TxHash;
const REVOKE = `0x${"b".repeat(64)}` as TxHash;
const UNTAGGED = `0x${"1".repeat(64)}` as TxHash;
const REPORT_PASS = `01900000-0000-7000-8000-000000000001${"ab".repeat(16)}`;
const REPORT_FAIL = `01900000-0000-7000-8000-000000000002${"cd".repeat(16)}`;
const ROOT = `0x${"11".repeat(32)}` as Hex;
const SESSION = `0x${"22".repeat(32)}` as Hex;
const REVOKED = `0x${"33".repeat(32)}` as Hex;

const tags = createTagDecoder();
const USDC = mainnet.x402Assets.find((asset) => asset.symbol === "USDC")?.address ?? PAYTO;

function calldata(codes: string | readonly string[]): Hex {
  const suffix = toDataSuffix(codes);
  return `0x1234${suffix.slice(2)}`;
}

function registrationUri(): string {
  const document = {
    type: EIP8004_REGISTRATION_TYPE,
    name: "Passing Agent",
    services: [{ name: "web", endpoint: "https://example.com" }],
    x402Support: true,
    registrations: [
      {
        agentId: 42,
        agentRegistry: `eip155:42220:${mainnet.erc8004Identity}`,
      },
    ],
  };
  return `data:application/json,${encodeURIComponent(JSON.stringify(document))}`;
}

function selfInfo(): SelfAgentInfo {
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
  };
}

function altanaKey(partial: Pick<AltanaKey, "keyId" | "isRoot" | "expiry" | "revoked">): AltanaKey {
  return {
    validator: AGENT,
    publicKey: "0x01",
    metadata: "0x",
    nonce: 0n,
    lastUpdated: 0n,
    ...partial,
  };
}

function tx(hash: TxHash, from: Address, input: Hex, index = 0): OutgoingTransaction {
  return {
    hash,
    from,
    to: from,
    input,
    blockNumber: "1000",
    index,
    status: "success",
  };
}

function passingSources(): CheckSources {
  const nowSeconds = Math.floor(Date.parse(NOW) / 1000);
  const expiry = nowSeconds + 30 * 24 * 60 * 60;
  const keys = [
    altanaKey({ keyId: ROOT, isRoot: true, expiry: 0, revoked: false }),
    altanaKey({ keyId: SESSION, isRoot: false, expiry, revoked: false }),
    altanaKey({ keyId: REVOKED, isRoot: false, expiry, revoked: true }),
  ];
  const erc8004: Erc8004Reader = {
    network: "mainnet",
    registry: mainnet.erc8004Identity,
    ownerOf: () => Promise.resolve(AGENT),
    getAgentWallet: () => Promise.resolve(AGENT),
    tokenURI: () => Promise.resolve(registrationUri()),
    balanceOf: () => Promise.resolve(1n),
  };
  const self: SelfReader = {
    network: "mainnet",
    chainId: 42220,
    registry: mainnet.selfAgentRegistry,
    getAgentInfo: () => Promise.resolve(selfInfo()),
    getAgentsByAddress: () => Promise.resolve([selfInfo()]),
    getAgentId: () => Promise.resolve(42n),
    isVerifiedAgent: () => Promise.resolve(true),
    isProofFresh: () => Promise.resolve(true),
  };
  const settlement: X402Settlement = {
    hash: PAYMENT,
    from: FACILITATOR,
    to: USDC,
    selector: "0xe3ee160e",
    asset: USDC,
    kind: "eip3009",
  };
  const x402: X402SettlementReader = {
    network: "mainnet",
    getFacilitatorSigners: () => Promise.resolve([FACILITATOR]),
    classifySettlement: (body) => Promise.resolve(body.hash === PAYMENT ? settlement : null),
  };
  const history: TxHistoryReader = {
    network: "mainnet",
    listOutgoing: (address) => {
      if (address.toLowerCase() === AGENT.toLowerCase()) {
        return Promise.resolve([tx(AGENT_TX, AGENT, calldata(CODE))]);
      }
      if (address.toLowerCase() === ALTANA.toLowerCase()) {
        return Promise.resolve([tx(ALTANA_TX, ALTANA, calldata(["altana", CODE]))]);
      }
      return Promise.resolve([]);
    },
    transactionCount: () => Promise.resolve(1n),
    hasTokenTransfers: () => Promise.resolve(false),
  };
  const payments: PaymentTxReader = {
    network: "mainnet",
    getTransaction: (hash) => {
      if (hash !== PAYMENT) {
        return Promise.resolve(null);
      }
      const body: PaymentTransaction = {
        hash: PAYMENT,
        from: FACILITATOR,
        to: USDC,
        input: "0xe3ee160e",
        status: "success",
        transfers: [
          {
            token: USDC,
            from: OTHER,
            to: PAYTO,
            value: "10000",
          },
        ],
      };
      return Promise.resolve(body);
    },
  };
  const receipts: TxReceiptReader = {
    network: "mainnet",
    getReceipt: (hash) => Promise.resolve(hash === REVOKE ? { status: "success" } : null),
  };
  const altana: AltanaReader = {
    network: "mainnet",
    keyStore: mainnet.altanaKeyStore,
    getKeys: () => Promise.resolve(keys.map((key) => key.keyId)),
    getKey: (_user, keyId) => {
      const found = keys.find((key) => key.keyId === keyId);
      return found === undefined
        ? Promise.reject(new CheckSourceError("not_found", "missing key"))
        : Promise.resolve(found);
    },
    isValidKey: (_user, keyId) => Promise.resolve(keyId !== REVOKED),
  };
  return {
    erc8004,
    self,
    x402,
    altana,
    tags,
    history,
    github: {
      repo: () =>
        Promise.resolve({
          state: "public",
          fork: false,
          createdAt: "2026-11-21T00:00:00.000Z",
        }),
      commitsBefore: () => Promise.resolve(0),
    },
    payments,
    receipts,
  };
}

function failingSources(): CheckSources {
  const erc8004: Erc8004Reader = {
    network: "mainnet",
    registry: mainnet.erc8004Identity,
    ownerOf: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    getAgentWallet: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    tokenURI: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    balanceOf: () => Promise.resolve(0n),
  };
  const self: SelfReader = {
    network: "mainnet",
    chainId: 42220,
    registry: mainnet.selfAgentRegistry,
    getAgentInfo: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    getAgentsByAddress: () => Promise.resolve([]),
    getAgentId: () => Promise.resolve(0n),
    isVerifiedAgent: () => Promise.resolve(false),
    isProofFresh: () => Promise.resolve(false),
  };
  const history: TxHistoryReader = {
    network: "mainnet",
    listOutgoing: (address) =>
      Promise.resolve(
        address.toLowerCase() === AGENT.toLowerCase() ||
          address.toLowerCase() === ALTANA.toLowerCase()
          ? [tx(UNTAGGED, address, "0x1234")]
          : [],
      ),
    transactionCount: () => Promise.resolve(1n),
    hasTokenTransfers: () => Promise.resolve(false),
  };
  const payments: PaymentTxReader = {
    network: "mainnet",
    getTransaction: () =>
      Promise.resolve({
        hash: BAD_PAYMENT,
        from: AGENT,
        to: USDC,
        input: "0xa9059cbb",
        status: "success",
        transfers: [
          {
            token: USDC,
            from: AGENT,
            to: OTHER,
            value: "1",
          },
        ],
      }),
  };
  const altana: AltanaReader = {
    network: "mainnet",
    keyStore: mainnet.altanaKeyStore,
    getKeys: () => Promise.resolve([]),
    getKey: () => Promise.reject(new CheckSourceError("not_found", "missing")),
    isValidKey: () => Promise.resolve(false),
  };
  return {
    erc8004,
    self,
    x402: {
      network: "mainnet",
      getFacilitatorSigners: () => Promise.resolve([FACILITATOR]),
      classifySettlement: () => Promise.resolve(null),
    },
    altana,
    tags,
    history,
    github: {
      repo: () => Promise.resolve({ state: "missing" }),
      commitsBefore: () => Promise.reject(new Error("repo missing")),
    },
    payments,
  };
}

const passingInput: EntryInput = parseEntryInput({
  network: "mainnet",
  tracks: ["t3", "t4"],
  agentWallet: AGENT,
  erc8004AgentId: "42",
  selfAgentId: "42",
  attributionCode: CODE,
  repoUrl: "https://github.com/example/passing-agent",
  payTo: PAYTO,
  x402PaymentTxs: [PAYMENT],
  altanaWallet: ALTANA,
  altanaRevokeTx: REVOKE,
});

const failingInput: EntryInput = parseEntryInput({
  network: "mainnet",
  tracks: ["t3", "t4"],
  agentWallet: AGENT,
  selfAgentId: "9",
  attributionCode: CODE,
  repoUrl: "https://github.com/example/missing",
  payTo: PAYTO,
  x402PaymentTxs: [BAD_PAYMENT],
  altanaWallet: ALTANA,
});

async function signed(
  input: EntryInput,
  sources: CheckSources,
  reportId: string,
): Promise<SignedReport> {
  const run = await runChecks(input, sources, { now: new Date(NOW) });
  const body = buildReport({
    reportId,
    generatedAt: NOW,
    input,
    run,
    signer: SIGNER,
  });
  return signReport(body, ANVIL_ACCOUNT);
}

function status(report: SignedReport, key: string): string {
  const result = report.results.find((item) => item.key === key);
  if (result === undefined) {
    throw new Error(`missing ${key}`);
  }
  return result.status;
}

async function expectGolden(name: string, report: SignedReport): Promise<void> {
  const directory = new URL("./fixtures/", import.meta.url);
  mkdirSync(directory, { recursive: true });
  const path = new URL(`${name}.json`, directory);
  const actual = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.UPDATE_GOLDEN === "1") {
    writeFileSync(path, actual);
  }
  const expected = readFileSync(path, "utf8");
  expect(JSON.parse(actual)).toEqual(JSON.parse(expected));
  const verified = await verifyReport(report);
  expect(verified).toEqual({ valid: true, signer: SIGNER });
}

describe("EIP-191 report signer", () => {
  it("is the signer the API calls, including an unsigned passive report", async () => {
    const signer = createEip191ReportSigner(ANVIL_ACCOUNT);
    const unsigned = {
      reportId: "01900000-0000-7000-8000-000000000003",
      version: 1 as const,
      network: "testnet" as const,
      generatedAt: NOW,
      input: { network: "testnet" },
      results: [] as const,
      disclaimer: "Heuristic pre-check; organisers decide eligibility.",
    };
    const signed = await signer.sign(unsigned);
    expect(signed.signer).toBe(SIGNER);
    expect(reportMessage(signed.reportId, signed.digest)).toBe(
      `Preflight report v1\n${signed.reportId}\n${signed.digest.slice(2)}`,
    );
    expect(await signer.verify(signed)).toBe(true);
    expect(await signer.verify({ ...signed, disclaimer: "changed" })).toBe(false);
  });
});

describe("golden reports", () => {
  it("signs a fully automatic pass, leaving PayTo unknown", async () => {
    const report = await signed(passingInput, passingSources(), REPORT_PASS);
    expect(report.practice).toBe(false);
    expect(report.summary.global).toEqual({
      status: "unknown",
      blocking: [],
      unresolved: ["g7.x402.payto_registered"],
    });
    expect(report.summary.t3.status).toBe("pass");
    expect(report.summary.t4.status).toBe("pass");
    for (const key of [
      "g1.erc8004.registered",
      "g2.erc8004.wallet_match",
      "g3.attribution.tags",
      "g4.repo.public",
      "g5.repo.code_window",
      "g6.mainnet.activity",
      "g9.self.recommended",
      "t3.self.agent_mainnet",
      "t3.x402.payment_hash",
      "t4.altana.wallet",
      "t4.altana.session_key",
      "t4.altana.revoked",
      "t4.altana.tagged",
    ]) {
      expect(status(report, key)).toBe("pass");
    }
    expect(status(report, "g7.x402.payto_registered")).toBe("unknown");
    expect(report.checklistManual.length).toBeGreaterThan(0);
    await expectGolden("passing-report", report);

    const tampered: SignedReport = {
      ...report,
      results: report.results.map((result, index) =>
        index === 0 ? { ...result, hint: `${result.hint} extra` } : result,
      ),
    };
    expect((await verifyReport(tampered)).valid).toBe(false);
  });

  it("signs a failing entry without passing any missing read", async () => {
    const report = await signed(failingInput, failingSources(), REPORT_FAIL);
    expect(report.summary.global.status).toBe("fail");
    expect(report.summary.t3.status).toBe("fail");
    expect(report.summary.t4.status).toBe("fail");
    expect(report.summary.global.blocking).toEqual(
      expect.arrayContaining(["g1.erc8004.registered", "g3.attribution.tags", "g4.repo.public"]),
    );
    expect(status(report, "g3.attribution.tags")).toBe("fail");
    expect(status(report, "g6.mainnet.activity")).toBe("pass");
    expect(status(report, "g7.x402.payto_registered")).toBe("unknown");
    expect(status(report, "g9.self.recommended")).toBe("warn");
    expect(status(report, "t3.self.agent_mainnet")).toBe("fail");
    expect(status(report, "t3.x402.payment_hash")).toBe("fail");
    expect(status(report, "t4.altana.wallet")).toBe("fail");
    expect(
      report.results.some(
        (result) => result.status === "pass" && result.evidence.observed !== true,
      ),
    ).toBe(false);
    await expectGolden("failing-report", report);
  });
});
