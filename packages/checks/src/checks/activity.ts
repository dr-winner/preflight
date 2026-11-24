import { fail, pass, unknown } from "../domain.js";
import type { TxHistoryReader } from "../extensions.js";
import type { EntryInput } from "../input.js";
import { tryRead } from "../read.js";

const G6 = "g6.mainnet.activity" as const;
const HINT = "Only Celo mainnet counts";

export async function checkMainnetActivity(input: EntryInput, history: TxHistoryReader) {
  if (history.network !== "mainnet") {
    return fail(
      G6,
      {
        observed: false,
        reason: "contradicted",
        readerNetwork: history.network,
        entryNetwork: input.network,
      },
      HINT,
    );
  }

  const [count, transfers] = await Promise.all([
    tryRead(() => history.transactionCount(input.agentWallet)),
    tryRead(() => history.hasTokenTransfers(input.agentWallet)),
  ]);

  if (count.ok && count.value > 0n) {
    return pass(
      G6,
      {
        observed: true,
        transactionCount: count.value.toString(10),
        tokenTransfers: transfers.ok ? transfers.value : null,
      },
      "No change needed. This wallet has Celo mainnet transactions.",
    );
  }
  if (transfers.ok && transfers.value) {
    return pass(
      G6,
      {
        observed: true,
        transactionCount: count.ok ? count.value.toString(10) : null,
        tokenTransfers: true,
      },
      "No change needed. This wallet has Celo mainnet token transfers.",
    );
  }
  if (!count.ok || !transfers.ok) {
    const message = !count.ok
      ? count.message
      : !transfers.ok
        ? transfers.message
        : "activity read failed";
    return unknown(
      G6,
      { observed: false, reason: "source_failed", message },
      "Retry the mainnet activity read. A failed lookup cannot pass.",
    );
  }
  return fail(
    G6,
    { observed: false, reason: "absent", transactionCount: "0", tokenTransfers: false },
    HINT,
  );
}
