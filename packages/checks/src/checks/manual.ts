import { unknown } from "../domain.js";
import type { EntryInput } from "../input.js";

const G7 = "g7.x402.payto_registered" as const;

export const PAYTO_HINT =
  "Register your PayTo address at sign-up. x402 payments do not carry attribution tags.";

export const SESSION_CAP_CHECKLIST =
  "Show the session spend cap and contract allowlist in the demo. The KeyStore has no documented on-chain read for them.";

export const AGENT_STOPPED_CHECKLIST =
  "Show the revoke transaction and the agent stopping in your demo.";

/** No public PayTo API exists. Compared with a live 402 in a later unit (X5). */
export function checkPayToRegistered(input: EntryInput) {
  return unknown(
    G7,
    {
      observed: false,
      reason: "manual",
      payTo: input.payTo ?? null,
      comparedToLive402: false,
    },
    PAYTO_HINT,
  );
}

export function manualChecklist(): readonly string[] {
  return [PAYTO_HINT, SESSION_CAP_CHECKLIST, AGENT_STOPPED_CHECKLIST];
}
