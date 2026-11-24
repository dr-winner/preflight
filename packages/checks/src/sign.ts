import { createHash } from "node:crypto";
import type { Address, Hex } from "@preflight/core";
import canonicalize from "canonicalize";
import { recoverMessageAddress, type Hex as ViemHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { REPORT_MESSAGE_LABEL } from "./constants.js";
import type { ReportBody } from "./report.js";

/**
 * One JCS + EIP-191 implementation for every signed report.
 * The hashed payload omits `signer`, `digest`, and `signature`.
 * The EIP-191 message uses the lowercase hex digest without a `0x` prefix.
 * The report stores that same digest with a `0x` prefix.
 */
const UNSIGNED_FIELDS = new Set(["signer", "digest", "signature"]);

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

export interface ReportSigner {
  readonly address: Address;
  sign<T extends { readonly reportId: string }>(
    report: T,
  ): Promise<T & { signer: Address; digest: Hex; signature: Hex }>;
  verify<
    T extends {
      readonly reportId: string;
      readonly signer: Address;
      readonly digest: Hex;
      readonly signature: Hex;
    },
  >(
    report: T,
  ): Promise<boolean>;
}

export interface SignedReport extends ReportBody {
  digest: Hex;
  signature: Hex;
}

export function reportPayload(report: object): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(report)) {
    if (UNSIGNED_FIELDS.has(key) || value === undefined) {
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

export function reportDigest(report: object): {
  canonical: string;
  digest: Hex;
  digestHex: string;
} {
  const canonical = canonicalize(reportPayload(report));
  if (canonical === undefined) {
    throw new Error("report could not be canonicalized");
  }
  const digestHex = createHash("sha256").update(canonical).digest("hex");
  return { canonical, digest: `0x${digestHex}`, digestHex };
}

export function reportMessage(reportId: string, digestHex: string): string {
  const hex = digestHex.startsWith("0x") ? digestHex.slice(2) : digestHex;
  return `${REPORT_MESSAGE_LABEL}\n${reportId}\n${hex}`;
}

export function createEip191ReportSigner(privateKey: Hex): ReportSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    async sign(report) {
      const { digest, digestHex } = reportDigest(report);
      const signature = await account.signMessage({
        message: reportMessage(report.reportId, digestHex),
      });
      return { ...report, signer: account.address, digest, signature };
    },
    verify(report) {
      return verifyReport(report).then((result) => result.valid);
    },
  };
}

export async function signReport(body: ReportBody, privateKey: Hex): Promise<SignedReport> {
  const signer = createEip191ReportSigner(privateKey);
  if (signer.address.toLowerCase() !== body.signer.toLowerCase()) {
    throw new Error("report signer does not match the signing key");
  }
  return signer.sign(body);
}

export async function verifyReport<
  T extends {
    readonly reportId: string;
    readonly signer: Address;
    readonly digest: Hex;
    readonly signature: Hex;
  },
>(report: T): Promise<{ valid: boolean; signer: Address | null }> {
  let recomputed: { digest: Hex; digestHex: string };
  try {
    recomputed = reportDigest(report);
  } catch {
    return { valid: false, signer: null };
  }
  if (recomputed.digest !== report.digest.toLowerCase()) {
    return { valid: false, signer: report.signer };
  }
  try {
    const recovered = await recoverMessageAddress({
      message: reportMessage(report.reportId, recomputed.digestHex),
      signature: report.signature as ViemHex,
    });
    const valid = recovered.toLowerCase() === report.signer.toLowerCase();
    return { valid, signer: recovered };
  } catch {
    return { valid: false, signer: null };
  }
}
