import { mainnet, networkTable } from "@preflight/config";
import type { Address, Erc8004Reader, SelfAgentInfo, SelfReader } from "@preflight/core";
import type { OwnedTokenLookup, RegistrationJsonReader } from "../extensions.js";
import type { EntryInput } from "../input.js";
import {
  decodeTokenUri,
  expectedAgentRegistry,
  parseRegistrationDocument,
  type ParsedRegistration,
} from "../registration.js";
import { tryRead } from "../read.js";
import { fail, pass, unknown, warn } from "../domain.js";
import { sameAddress } from "../wallets.js";

const G1 = "g1.erc8004.registered" as const;
const G2 = "g2.erc8004.wallet_match" as const;

const SELF_ONLY_HINT = `also register on ${mainnet.erc8004Identity} to be safe`;
const WALLET_HINT = "register from the wallet you added to your entry, or setAgentWallet";

type TokenRecord = {
  agentId: string;
  owner: Address;
  agentWallet: Address;
  tokenUri: string;
};

type Canonical =
  | { state: "unavailable"; message: string }
  | { state: "token"; token: TokenRecord; ids: readonly string[] }
  | { state: "balance"; balance: string }
  | { state: "none" };

async function readToken(
  erc8004: Erc8004Reader,
  agentId: bigint,
): Promise<
  | { state: "token"; token: TokenRecord }
  | { state: "missing" }
  | { state: "unavailable"; message: string }
> {
  const [owner, wallet, uri] = await Promise.all([
    tryRead(() => erc8004.ownerOf(agentId)),
    tryRead(() => erc8004.getAgentWallet(agentId)),
    tryRead(() => erc8004.tokenURI(agentId)),
  ]);
  const reads = [owner, wallet, uri];
  const unavailable = reads.find((read) => !read.ok && read.code === "unavailable");
  if (unavailable !== undefined && !unavailable.ok) {
    return { state: "unavailable", message: unavailable.message };
  }
  if (!owner.ok || !wallet.ok || !uri.ok) {
    return { state: "missing" };
  }
  return {
    state: "token",
    token: {
      agentId: agentId.toString(10),
      owner: owner.value,
      agentWallet: wallet.value,
      tokenUri: uri.value,
    },
  };
}

async function resolveCanonical(
  input: EntryInput,
  erc8004: Erc8004Reader,
  ownedTokens: OwnedTokenLookup | undefined,
): Promise<Canonical> {
  if (erc8004.network !== input.network) {
    return { state: "unavailable", message: "ERC-8004 reader network does not match the entry" };
  }

  if (input.erc8004AgentId !== undefined) {
    const read = await readToken(erc8004, BigInt(input.erc8004AgentId));
    if (read.state === "unavailable") {
      return read;
    }
    if (read.state === "token") {
      return { state: "token", token: read.token, ids: [read.token.agentId] };
    }
  }

  if (ownedTokens !== undefined) {
    const ids = await tryRead(() => ownedTokens.tokenIdsOf(input.agentWallet));
    if (!ids.ok) {
      if (ids.code === "unavailable") {
        return { state: "unavailable", message: ids.message };
      }
    } else if (ids.value.length > 0) {
      const loaded: TokenRecord[] = [];
      for (const agentId of ids.value) {
        const read = await readToken(erc8004, agentId);
        if (read.state === "unavailable") {
          return read;
        }
        if (read.state === "token") {
          loaded.push(read.token);
        }
      }
      const match = loaded.find(
        (token) =>
          sameAddress(token.owner, input.agentWallet) ||
          sameAddress(token.agentWallet, input.agentWallet),
      );
      const chosen = match ?? loaded[0];
      if (chosen !== undefined) {
        return {
          state: "token",
          token: chosen,
          ids: loaded.map((token) => token.agentId),
        };
      }
    }
  }

  const balance = await tryRead(() => erc8004.balanceOf(input.agentWallet));
  if (!balance.ok) {
    return { state: "unavailable", message: balance.message };
  }
  if (balance.value > 0n) {
    return { state: "balance", balance: balance.value.toString(10) };
  }
  return { state: "none" };
}

type SelfLookup =
  | { state: "unavailable"; message: string }
  | { state: "found"; agents: readonly SelfAgentInfo[] }
  | { state: "none" };

async function lookupSelf(input: EntryInput, self: SelfReader): Promise<SelfLookup> {
  if (self.network !== input.network) {
    return { state: "unavailable", message: "Self reader network does not match the entry" };
  }
  const byAddress = await tryRead(() => self.getAgentsByAddress(input.agentWallet));
  if (!byAddress.ok && byAddress.code === "unavailable") {
    return { state: "unavailable", message: byAddress.message };
  }
  const agents = byAddress.ok ? [...byAddress.value] : [];
  const selfAgentId = input.selfAgentId;
  if (selfAgentId !== undefined) {
    const info = await tryRead(() => self.getAgentInfo(selfAgentId));
    if (!info.ok && info.code === "unavailable") {
      return { state: "unavailable", message: info.message };
    }
    if (info.ok && !agents.some((agent) => agent.agentId === info.value.agentId)) {
      agents.push(info.value);
    }
  }
  return agents.length > 0 ? { state: "found", agents } : { state: "none" };
}

function selfIds(lookup: SelfLookup): string[] {
  return lookup.state === "found" ? lookup.agents.map((agent) => agent.agentId) : [];
}

type RegistrationState =
  | { state: "valid"; registration: ParsedRegistration }
  | { state: "invalid"; reason: string }
  | { state: "missing"; reason: string }
  | { state: "source_failed"; message: string };

async function loadRegistration(
  tokenUri: string,
  expectedRegistry: string,
  reader: RegistrationJsonReader | undefined,
): Promise<RegistrationState> {
  const decoded = decodeTokenUri(tokenUri);
  if (decoded.state === "json") {
    const parsed = parseRegistrationDocument(decoded.value, expectedRegistry);
    return parsed.ok
      ? { state: "valid", registration: parsed.value }
      : { state: "invalid", reason: parsed.reason };
  }
  if (decoded.state === "remote") {
    if (reader === undefined) {
      return { state: "missing", reason: "tokenURI was not fetched" };
    }
    const body = await tryRead(() => reader.read(tokenUri));
    if (!body.ok) {
      return { state: "source_failed", message: body.message };
    }
    const parsed = parseRegistrationDocument(body.value, expectedRegistry);
    return parsed.ok
      ? { state: "valid", registration: parsed.value }
      : { state: "invalid", reason: parsed.reason };
  }
  return { state: "invalid", reason: "tokenURI is not https, ipfs, or data" };
}

function registrationJson(registration: ParsedRegistration) {
  return {
    type: registration.type,
    serviceCount: registration.services.length,
    x402Support: registration.x402Support,
    agentRegistry: registration.agentRegistry,
  };
}

export async function checkErc8004Registered(
  input: EntryInput,
  erc8004: Erc8004Reader,
  self: SelfReader,
  extras: {
    ownedTokens?: OwnedTokenLookup;
    registrationJson?: RegistrationJsonReader;
  },
) {
  const [canonical, selfLookup] = await Promise.all([
    resolveCanonical(input, erc8004, extras.ownedTokens),
    lookupSelf(input, self),
  ]);

  if (canonical.state === "unavailable" && selfLookup.state === "unavailable") {
    return unknown(
      G1,
      { observed: false, reason: "source_failed", message: canonical.message },
      "Retry when the ERC-8004 registry and the Self API answer.",
    );
  }

  if (canonical.state === "token") {
    const table = networkTable(input.network);
    const registration = await loadRegistration(
      canonical.token.tokenUri,
      expectedAgentRegistry(table),
      extras.registrationJson,
    );
    if (registration.state === "source_failed") {
      return unknown(
        G1,
        {
          observed: false,
          reason: "source_failed",
          agentId: canonical.token.agentId,
          message: registration.message,
        },
        "Retry the registration JSON fetch. A missing document must not be treated as valid.",
      );
    }
    const base = {
      registry: erc8004.registry,
      agentId: canonical.token.agentId,
      owner: canonical.token.owner,
      agentWallet: canonical.token.agentWallet,
      tokenUri: canonical.token.tokenUri,
      selfAgentIds: selfIds(selfLookup),
    };
    if (registration.state === "valid") {
      return pass(
        G1,
        { observed: true, ...base, registration: registrationJson(registration.registration) },
        "No change needed for ERC-8004 registration. Keep this token on the selected network.",
      );
    }
    const reason = registration.reason;
    return warn(
      G1,
      { observed: true, ...base, registration: null, registrationProblem: reason },
      "Publish ERC-8004 registration-v1 JSON at tokenURI with services, x402Support, and this network's agentRegistry.",
    );
  }

  if (canonical.state === "balance") {
    return warn(
      G1,
      {
        observed: true,
        registry: erc8004.registry,
        balance: canonical.balance,
        registration: null,
        registrationProblem: "token id was not resolved, so tokenURI was not read",
        selfAgentIds: selfIds(selfLookup),
      },
      "Pass erc8004AgentId so tokenURI can be checked, and publish registration-v1 JSON.",
    );
  }

  if (canonical.state === "unavailable") {
    return unknown(
      G1,
      { observed: false, reason: "source_failed", message: canonical.message },
      "Retry the ERC-8004 read before treating this entry as registered.",
    );
  }

  if (selfLookup.state === "unavailable") {
    return unknown(
      G1,
      { observed: false, reason: "source_failed", message: selfLookup.message },
      "Retry the Self API. A canonical registry token was not found, and Self could not be checked.",
    );
  }

  if (selfLookup.state === "found") {
    return warn(
      G1,
      {
        observed: true,
        registry: erc8004.registry,
        selfAgentIds: selfIds(selfLookup),
        canonical: false,
      },
      SELF_ONLY_HINT,
    );
  }

  return fail(
    G1,
    { observed: false, reason: "absent", registry: erc8004.registry, selfAgentIds: [] },
    `Register the agent on ${erc8004.registry}. ${SELF_ONLY_HINT}.`,
  );
}

export async function checkErc8004WalletMatch(
  input: EntryInput,
  erc8004: Erc8004Reader,
  ownedTokens: OwnedTokenLookup | undefined,
) {
  const canonical = await resolveCanonical(input, erc8004, ownedTokens);
  if (canonical.state === "unavailable") {
    return unknown(
      G2,
      { observed: false, reason: "source_failed", message: canonical.message },
      "Retry the ERC-8004 read. Wallet match cannot pass without ownerOf and getAgentWallet.",
    );
  }
  if (canonical.state === "balance") {
    return unknown(
      G2,
      {
        observed: false,
        reason: "missing_input",
        balance: canonical.balance,
      },
      "Pass erc8004AgentId. Balance is non-zero, but the token id is required to compare wallets.",
    );
  }
  if (canonical.state === "none") {
    return fail(
      G2,
      { observed: false, reason: "absent", agentWallet: input.agentWallet },
      WALLET_HINT,
    );
  }

  const ownerMatch = sameAddress(canonical.token.owner, input.agentWallet);
  const walletMatch = sameAddress(canonical.token.agentWallet, input.agentWallet);
  const matched =
    ownerMatch && walletMatch ? "owner_and_agentWallet" : ownerMatch ? "owner" : "agentWallet";
  if (ownerMatch || walletMatch) {
    return pass(
      G2,
      {
        observed: true,
        agentId: canonical.token.agentId,
        matched,
        owner: canonical.token.owner,
        agentWalletOnIdentity: canonical.token.agentWallet,
        entryWallet: input.agentWallet,
      },
      "No change needed. The identity is tied to the wallet on the entry.",
    );
  }
  return fail(
    G2,
    {
      observed: false,
      reason: "contradicted",
      agentId: canonical.token.agentId,
      owner: canonical.token.owner,
      agentWalletOnIdentity: canonical.token.agentWallet,
      entryWallet: input.agentWallet,
    },
    WALLET_HINT,
  );
}
