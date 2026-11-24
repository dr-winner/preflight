import { checkAltanaRevoked, checkAltanaSession, checkAltanaWallet } from "./checks/altana.js";
import { checkAttributionTags, checkAltanaTagged } from "./checks/attribution.js";
import { checkErc8004Registered, checkErc8004WalletMatch } from "./checks/erc8004.js";
import { checkMainnetActivity } from "./checks/activity.js";
import { checkPayToRegistered, manualChecklist } from "./checks/manual.js";
import { checkX402Payment } from "./checks/payment.js";
import { checkCodeWindow, checkRepoPublic } from "./checks/repo.js";
import { checkSelfAgentMainnet, checkSelfRecommended } from "./checks/self.js";
import { CHECK_KEYS, type CheckKey } from "./domain.js";
import type {
  GithubReader,
  OwnedTokenLookup,
  PaymentTxReader,
  RegistrationJsonReader,
  TxHistoryReader,
  TxReceiptReader,
  UserOpTagDecoder,
} from "./extensions.js";
import { parseEntryInput, type EntryInput } from "./input.js";
import { createUserOpTagDecoder } from "./user-ops.js";
import type {
  AltanaReader,
  Erc8004Reader,
  SelfReader,
  TagDecoder,
  X402SettlementReader,
} from "@preflight/core";

export interface CheckSources {
  readonly erc8004: Erc8004Reader;
  readonly self: SelfReader;
  readonly x402: X402SettlementReader;
  readonly altana: AltanaReader;
  readonly tags: TagDecoder;
  readonly history: TxHistoryReader;
  readonly github: GithubReader;
  readonly payments: PaymentTxReader;
  readonly receipts?: TxReceiptReader;
  readonly ownedTokens?: OwnedTokenLookup;
  readonly registrationJson?: RegistrationJsonReader;
  readonly userOps?: UserOpTagDecoder;
}

export interface CheckRun {
  readonly results: readonly CheckResult[];
  readonly checklistManual: readonly string[];
}

export type CheckResult =
  | Awaited<ReturnType<typeof checkErc8004Registered>>
  | Awaited<ReturnType<typeof checkErc8004WalletMatch>>
  | Awaited<ReturnType<typeof checkAttributionTags>>
  | Awaited<ReturnType<typeof checkRepoPublic>>
  | Awaited<ReturnType<typeof checkCodeWindow>>
  | Awaited<ReturnType<typeof checkMainnetActivity>>
  | Awaited<ReturnType<typeof checkPayToRegistered>>
  | Awaited<ReturnType<typeof checkSelfRecommended>>
  | Awaited<ReturnType<typeof checkSelfAgentMainnet>>
  | Awaited<ReturnType<typeof checkX402Payment>>
  | Awaited<ReturnType<typeof checkAltanaWallet>>
  | Awaited<ReturnType<typeof checkAltanaSession>>
  | Awaited<ReturnType<typeof checkAltanaRevoked>>
  | Awaited<ReturnType<typeof checkAltanaTagged>>;

function byCatalogue(left: CheckResult, right: CheckResult): number {
  return CHECK_KEYS.indexOf(left.key) - CHECK_KEYS.indexOf(right.key);
}

function extras(sources: CheckSources) {
  return {
    ...(sources.ownedTokens === undefined ? {} : { ownedTokens: sources.ownedTokens }),
    ...(sources.registrationJson === undefined
      ? {}
      : { registrationJson: sources.registrationJson }),
  };
}

export async function runChecks(
  input: EntryInput,
  sources: CheckSources,
  options: { readonly now: Date },
): Promise<CheckRun> {
  const entry = parseEntryInput(input);
  const userOps = sources.userOps ?? createUserOpTagDecoder();
  const results = await Promise.all([
    checkErc8004Registered(entry, sources.erc8004, sources.self, extras(sources)),
    checkErc8004WalletMatch(entry, sources.erc8004, sources.ownedTokens),
    checkAttributionTags(entry, sources.history, sources.x402, sources.tags, userOps),
    checkRepoPublic(entry, sources.github),
    checkCodeWindow(entry, sources.github),
    checkMainnetActivity(entry, sources.history),
    Promise.resolve(checkPayToRegistered(entry)),
    checkSelfRecommended(entry, sources.self),
    checkSelfAgentMainnet(entry, sources.self, options.now),
    checkX402Payment(entry, sources.payments, sources.x402),
    checkAltanaWallet(entry, sources.altana),
    checkAltanaSession(entry, sources.altana, options.now),
    checkAltanaRevoked(entry, sources.altana, sources.receipts),
    checkAltanaTagged(entry, sources.history, sources.x402, sources.tags, userOps),
  ]);
  results.sort(byCatalogue);
  const keys = new Set<CheckKey>(results.map((result) => result.key));
  if (keys.size !== CHECK_KEYS.length) {
    throw new Error("check engine did not return the full catalogue");
  }
  return { results, checklistManual: manualChecklist() };
}
