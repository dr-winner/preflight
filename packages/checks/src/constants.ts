/** Build opened Fri 20 Nov 2026 14:00 GMT. docs/SPEC.md §0 R5. */
export const HACKATHON_OPENED_AT = "2026-11-20T14:00:00.000Z";

export const PROOF_EXPIRY_WARN_MS = 14 * 24 * 60 * 60 * 1000;

export const MAINNET_CHAIN_ID = 42220;

/** docs/SPEC.md §2 G3: page through outgoing txs and cap at 1,000. */
export const TX_LIST_CAP = 1000;

export const REPORT_VERSION = 1;

export const REPORT_DISCLAIMER = "Heuristic pre-check; organisers decide eligibility.";

/** EIP-191 payload label. docs/SPEC.md §4.6. */
export const REPORT_MESSAGE_LABEL = "Preflight report v1";

export const EIP8004_REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

/** EntryPoint handleOps selectors. docs/SPEC.md §2 G3. */
export const HANDLE_OPS_SELECTORS = ["0x1fad948c", "0x765e827f"] as const;
