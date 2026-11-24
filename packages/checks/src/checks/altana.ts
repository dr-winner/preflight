import type { Address, AltanaKey, AltanaReader } from "@preflight/core";
import { fail, pass, unknown, warn } from "../domain.js";
import type { JsonObject } from "../json.js";
import type { TxReceiptReader } from "../extensions.js";
import type { EntryInput } from "../input.js";
import { tryRead } from "../read.js";

const T41 = "t4.altana.wallet" as const;
const T42 = "t4.altana.session_key" as const;
const T43 = "t4.altana.revoked" as const;

const MAINNET_HINT = "Register the Altana wallet on Celo mainnet. Testnet keys do not count.";

interface LoadedKey {
  keyId: string;
  validator: string;
  expiry: number;
  isRoot: boolean;
  revoked: boolean;
  isValidKey: boolean | null;
}

type KeyLoad =
  | { state: "unavailable"; message: string }
  | { state: "ready"; keys: readonly LoadedKey[]; unreadable: number };

function explorerUrl(wallet: Address): string {
  return `https://explorer.altana.network/account/${wallet}`;
}

function toLoaded(key: AltanaKey, isValidKey: boolean | null): LoadedKey {
  return {
    keyId: key.keyId,
    validator: key.validator,
    expiry: key.expiry,
    isRoot: key.isRoot,
    revoked: key.revoked,
    isValidKey,
  };
}

function keyJson(key: LoadedKey): JsonObject {
  return {
    keyId: key.keyId,
    validator: key.validator,
    expiry: key.expiry,
    isRoot: key.isRoot,
    revoked: key.revoked,
    isValidKey: key.isValidKey,
  };
}

async function loadKeys(altana: AltanaReader, wallet: Address): Promise<KeyLoad> {
  const ids = await tryRead(() => altana.getKeys(wallet));
  if (!ids.ok) {
    return { state: "unavailable", message: ids.message };
  }
  const keys: LoadedKey[] = [];
  let unreadable = 0;
  const seen = new Set<string>();
  for (const keyId of ids.value) {
    const id = keyId.toLowerCase();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const key = await tryRead(() => altana.getKey(wallet, keyId));
    if (!key.ok) {
      if (key.code === "unavailable") {
        unreadable += 1;
        continue;
      }
      unreadable += 1;
      continue;
    }
    const valid = await tryRead(() => altana.isValidKey(wallet, keyId));
    keys.push(toLoaded(key.value, valid.ok ? valid.value : null));
    if (!valid.ok && valid.code === "unavailable") {
      unreadable += 1;
    }
  }
  return { state: "ready", keys, unreadable };
}

export async function checkAltanaWallet(input: EntryInput, altana: AltanaReader) {
  if (input.altanaWallet === undefined) {
    return unknown(
      T41,
      { observed: false, reason: "missing_input" },
      "Submit the Altana wallet address that acts on Celo mainnet.",
    );
  }
  const wallet = input.altanaWallet;
  const link = explorerUrl(wallet);
  if (altana.network !== "mainnet") {
    return fail(
      T41,
      {
        observed: false,
        reason: "contradicted",
        readerNetwork: altana.network,
        altanaWallet: wallet,
        explorer: link,
      },
      MAINNET_HINT,
    );
  }
  const loaded = await loadKeys(altana, wallet);
  if (loaded.state === "unavailable") {
    return unknown(
      T41,
      { observed: false, reason: "source_failed", message: loaded.message, altanaWallet: wallet },
      "Retry the Altana KeyStore read. A failed getKeys cannot pass.",
    );
  }
  const root = loaded.keys.find((key) => key.isRoot);
  if (root !== undefined) {
    return pass(
      T41,
      {
        observed: true,
        altanaWallet: wallet,
        keyStore: altana.keyStore,
        explorer: link,
        rootKeyId: root.keyId,
        keys: loaded.keys.map(keyJson),
      },
      "No change needed. The admin key is registered on the Celo mainnet KeyStore.",
    );
  }
  if (loaded.unreadable > 0) {
    return unknown(
      T41,
      {
        observed: false,
        reason: "source_failed",
        altanaWallet: wallet,
        unreadable: loaded.unreadable,
      },
      "Retry getKey. A key that could not be read might be the admin key.",
    );
  }
  return fail(
    T41,
    {
      observed: false,
      reason: "absent",
      altanaWallet: wallet,
      keyStore: altana.keyStore,
      explorer: link,
    },
    "Register an admin key (isRoot) for this wallet on the Celo mainnet KeyStore.",
  );
}

export async function checkAltanaSession(input: EntryInput, altana: AltanaReader, now: Date) {
  if (input.altanaWallet === undefined) {
    return unknown(
      T42,
      { observed: false, reason: "missing_input" },
      "Submit the Altana wallet so its session keys can be read.",
    );
  }
  if (altana.network !== "mainnet") {
    return fail(
      T42,
      { observed: false, reason: "contradicted", readerNetwork: altana.network },
      MAINNET_HINT,
    );
  }
  const loaded = await loadKeys(altana, input.altanaWallet);
  if (loaded.state === "unavailable") {
    return unknown(
      T42,
      { observed: false, reason: "source_failed", message: loaded.message },
      "Retry the KeyStore read before judging the session key.",
    );
  }
  const sessions = loaded.keys.filter((key) => !key.isRoot);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const live = sessions.filter((key) => key.expiry > nowSeconds);
  const expired = sessions.filter((key) => key.expiry > 0 && key.expiry <= nowSeconds);
  const evidence = {
    altanaWallet: input.altanaWallet,
    sessionKeys: sessions.map(keyJson),
    capsOnChain: "unknown" as const,
  };
  if (live.length > 0) {
    return pass(
      T42,
      { observed: true, ...evidence, expiry: live[0]?.expiry ?? 0 },
      "Set a spend cap and a contract allowlist in the session grant, and show both in the demo.",
    );
  }
  if (expired.length > 0) {
    return warn(
      T42,
      { observed: true, ...evidence, expiry: expired[0]?.expiry ?? 0 },
      "The session key expiry is in the past. Grant a new session key with a future expiry.",
    );
  }
  if (loaded.unreadable > 0) {
    return unknown(
      T42,
      { observed: false, reason: "source_failed", unreadable: loaded.unreadable },
      "Retry getKey. A session key may not have been read.",
    );
  }
  return fail(
    T42,
    { observed: false, reason: "absent", ...evidence },
    "Grant a session key with expiry > 0, plus a spend cap or a contract allowlist.",
  );
}

export async function checkAltanaRevoked(
  input: EntryInput,
  altana: AltanaReader,
  receipts: TxReceiptReader | undefined,
) {
  if (input.altanaWallet === undefined) {
    return unknown(
      T43,
      { observed: false, reason: "missing_input" },
      "Submit the Altana wallet so a revoked session key can be checked.",
    );
  }
  if (altana.network !== "mainnet") {
    return fail(
      T43,
      { observed: false, reason: "contradicted", readerNetwork: altana.network },
      MAINNET_HINT,
    );
  }
  const loaded = await loadKeys(altana, input.altanaWallet);
  if (loaded.state === "unavailable") {
    return unknown(
      T43,
      { observed: false, reason: "source_failed", message: loaded.message },
      "Retry the KeyStore read. Revocation cannot pass without getKey.",
    );
  }

  let revokeTx: {
    hash: string;
    status: "success" | "reverted" | "not_found" | "unavailable";
  } | null = null;
  const revokeHash = input.altanaRevokeTx;
  if (revokeHash !== undefined && receipts !== undefined) {
    if (receipts.network !== "mainnet") {
      revokeTx = { hash: revokeHash, status: "unavailable" };
    } else {
      const receipt = await tryRead(() => receipts.getReceipt(revokeHash));
      if (!receipt.ok) {
        revokeTx = { hash: revokeHash, status: "unavailable" };
      } else if (receipt.value === null) {
        revokeTx = { hash: revokeHash, status: "not_found" };
      } else {
        revokeTx = { hash: revokeHash, status: receipt.value.status };
      }
    }
  } else if (revokeHash !== undefined) {
    revokeTx = { hash: revokeHash, status: "unavailable" };
  }

  const revoked = loaded.keys.filter((key) => !key.isRoot && key.revoked);
  if (revoked.length > 0) {
    return pass(
      T43,
      {
        observed: true,
        altanaWallet: input.altanaWallet,
        revokedKeyIds: revoked.map((key) => key.keyId),
        isValidKeyFalse: revoked.some((key) => key.isValidKey === false),
        revokeTx,
        agentStopped: "unknown",
      },
      "Show the revoke transaction and the agent stopping in your demo.",
    );
  }
  if (loaded.unreadable > 0) {
    return unknown(
      T43,
      { observed: false, reason: "source_failed", unreadable: loaded.unreadable, revokeTx },
      "Retry getKey before deciding that no session key is revoked.",
    );
  }
  return fail(
    T43,
    {
      observed: false,
      reason: "absent",
      altanaWallet: input.altanaWallet,
      sessionKeys: loaded.keys.filter((key) => !key.isRoot).length,
      revokeTx,
    },
    "Revoke a session key on Celo mainnet. Revocation is monotonic: getKey.revoked must be true.",
  );
}
