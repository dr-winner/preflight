import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const canonicalize = require("canonicalize") as (value: unknown) => string | undefined;
import { verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Seam for unit 3 (`packages/checks`).
 * That package owns the report builder and signer. This API calls `ReportSigner`
 * and does not import `packages/checks`. Swap `createEip191ReportSigner` for the
 * checks implementation when it merges; the signed field names stay the same.
 */
export interface UnsignedReport {
  reportId: string;
  version: 1;
  network: "mainnet" | "testnet";
  generatedAt: string;
  input: Record<string, unknown>;
  results: readonly {
    key: string;
    status: "pass" | "fail" | "warn" | "unknown";
    evidence: Record<string, unknown>;
    hint: string;
  }[];
  disclaimer: string;
}

export interface SignedReport extends UnsignedReport {
  signer: Address;
  digest: Hex;
  signature: Hex;
}

export interface ReportSigner {
  readonly address: Address;
  sign(report: UnsignedReport): Promise<SignedReport>;
  verify(report: SignedReport): Promise<boolean>;
}

function messageFor(reportId: string, digestHex: string): string {
  return `Preflight report v1\n${reportId}\n${digestHex}`;
}

export function createEip191ReportSigner(privateKey: Hex): ReportSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    async sign(report) {
      const canonical = canonicalize(report);
      if (canonical === undefined) {
        throw new Error("report could not be canonicalized");
      }
      const digestHex = createHash("sha256").update(canonical).digest("hex");
      const signature = await account.signMessage({
        message: messageFor(report.reportId, digestHex),
      });
      return { ...report, signer: account.address, digest: `0x${digestHex}`, signature };
    },
    async verify(report) {
      const { signer, digest, signature, ...unsigned } = report;
      const canonical = canonicalize(unsigned);
      if (canonical === undefined) {
        return false;
      }
      const digestHex = createHash("sha256").update(canonical).digest("hex");
      if (`0x${digestHex}` !== digest) {
        return false;
      }
      return verifyMessage({
        address: signer,
        message: messageFor(unsigned.reportId, digestHex),
        signature,
      });
    },
  };
}
