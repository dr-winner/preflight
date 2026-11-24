# Preflight — Build Spec (v1)

**What it is:** a paid x402 API, plus an MCP tool, that hackathon entrants' agents call before the deadline. It checks whether their *Agents Open for Business* entry meets each track's must-haves and returns a **signed per-track pass/fail/unknown report with fix hints**.

- Hackathon: Celo *Agents Open for Business* (Loops House). Submissions close **Mon 7 Dec 2026, 09:00 GMT**. Winners announced Fri 11 Dec. AskBots review round 2 is Fri 4 Dec.
- Owner: Dr Winner (GitHub `@dr-winner`). Repo: `dr-winner/preflight`, private until registration, then public. All commits are authored as Dr Winner's GitHub user, every change goes issue → branch → PR, and the repo keeps a `CHANGELOG.md`.
- Network plan: build on **Celo Sepolia (11142220)** first. **Celo mainnet (42220)** is approved from about **Sat 28 Nov**. Only mainnet activity counts for judging.
- Target tracks: **Track 3, Self Agent ID** (1st $700) and **Track 4, Altana Agent Wallets** (1st $750 + 25k XP). The checker also *covers* Tracks 1 and 2 for entrants.

### How to read this spec
- **[V]** means verified on 24 Nov 2026 against a fetched doc, a live RPC/API call, or published package source. The source is cited.
- **[U]** means unverified. Confirm it before relying on it. Every [U] item also appears in §11.
- Raw copies of every source doc are in `/workspace/preflight-notes/sources/` on the box. The coding agent should re-fetch the live versions, not trust these copies.
- **Never invent** an address, ABI, endpoint or event. If something isn't in this spec or a cited source, mark it `TODO(unverified)` in code and raise it in the PR.

---

## 0. Ground truth: the rules being checked

Source: https://www.loops.house/agents-open-for-business (page payload re-fetched 24 Nov; requirement blocks unchanged from 23 Nov) [V].

### Global rules (every entry)
| ID | Rule (verbatim or close) | Preflight check |
|---|---|---|
| R1 | "Celo mainnet only (testnet references in your repo are fine)." | Activity has to be on chain 42220 |
| R2 | "Every entry registers its agent on ERC-8004." "Add your agent's wallet to your entry and register its ERC-8004 identity **from that wallet**." | `G1`, `G2` |
| R3 | "Public GitHub repo at registration that still resolves at judging." | `G4` |
| R4 | "An attribution tag in every transaction you want counted; x402 sellers also register their PayTo address." "It cannot be added later, so set it up before your first transaction." "x402 payments do not carry tags yet: register your PayTo address at sign-up instead." | `G3`, `G7` (manual) |
| R5 | "Code is written during the hackathon, from 20 Nov." (Build opened Fri 20 Nov 14:00 GMT.) | `G5` (warn-level) |
| R6 | "Sponsored gas is not a builder contribution." / "We count signers and authorisers, not only gas payers." | informs `G3`/`I*` |
| R7 | Independent user = "A wallet outside your team and not funded by you or your main funder… An agent wallet with its own ERC-8004 identity, registered by a different team, also counts when it pays you. Liquidity pools, routers, Textile makers and exchange wallets do not count. Arbitrage and self-trading score zero." | `I1` funding graph |
| R8 | "paid calls on buy from your agent count in your favour as real use." | `G8` (info) |

### Track requirements (verbatim lists from the page payload) [V]
- **T1 Stablecoin Corridors (Textile FX):** at least one tagged Textile FX conversion on Celo mainnet in a listed corridor, used in the product flow · payments in a local stablecoin reach a recipient outside the team · ERC-8004 identity · arbitrage, self-trading and acting as a Textile maker do not count.
- **T2 Agent Vault:** signs in to / checks out on ≥1 regular website through Agent Vault (submit the site) · ≥1 x402 payment through Celo's native facilitator (submit the hash) · a spending limit or rule in Agent Vault, with the demo showing what happens at the limit · the agent never sees the card or password · ERC-8004 identity · public X post tagging @selfxyz and @Celo with a demo clip and the repo link.
- **T3 Self Agent ID:** agent registered with Self Agent ID on Celo mainnet; submit its agentId. Judges check `GET https://agent-api.self.xyz/api/agent/info/42220/<agentId>` · ≥1 x402 payment through Celo's native facilitator (submit the hash) · identity changes what the product does: the service checks the human proof with SelfAgentVerifier or a registry read before it serves, pays or limits an agent; link the file and line · the demo shows a verified agent paying or getting paid and an unverified agent turned away; anything limited per person must be shared by two agents of the same person · ERC-8004 identity · public X post tagging @selfxyz and @Celo.
- **T4 Altana:** agent acts from an Altana wallet on Celo mainnet · ≥1 session key with a spend cap, contract allowlist or expiry, shown in the demo · the demo shows a revoke transaction and the agent being stopped · ERC-8004 identity.

---

## 1. Verified constants (put in `packages/chain/src/constants.ts`)

### Networks
| | Celo mainnet | Celo Sepolia | Source |
|---|---|---|---|
| chainId / CAIP-2 | 42220 / `eip155:42220` | 11142220 / `eip155:11142220` | x402 skill.md [V] |
| Public RPC | `https://forno.celo.org` | `https://forno.celo-sepolia.celo-testnet.org` | Self docs [V] |
| **RPC limit** | `eth_getLogs` rejects `toBlock - fromBlock` above **5000** (`max block range 5000, got 5001`) | rejects a difference above **100000** (`max block range 100000, got 100001`). Not the same cap as mainnet | live forno calls 24 Nov 2026 [V] |
| Explorer API (no key) | `https://celo.blockscout.com/api` (Etherscan-compatible `module=account&action=txlist/tokentx`) and `/api/v2/...` | `https://celo-sepolia.blockscout.com/api` (`module=account&action=txlist` returned OK) and `/api/v2/addresses/{address}/token-transfers?type=ERC-721` (returned `items`). That v2 response sent `x-ratelimit-limit: 180` | live test 24 Nov 2026 [V] |
| Celoscan/Etherscan v2 | needs an API key (`Missing/Invalid API Key`) | — | live test [V] |
| Block time | ~1 s | ~1 s | Self docs, Blockscout stats [V] |

### Contracts (code presence confirmed via `eth_getCode` on 24 Nov) [V]
| Contract | Mainnet 42220 | Sepolia 11142220 | Source |
|---|---|---|---|
| ERC-8004 Identity Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | docs.celo.org 8004 page; Altana networks page |
| ERC-8004 Reputation Registry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | docs.celo.org |
| SelfAgentRegistry (ERC-8004 + Proof-of-Human) | `0xaC3DF9ABf80d0F5c020C06B04Cced27763355944` | `0x043DaCac8b0771DD5b444bCC88f2f8BBDBEdd379` | Self docs + hackathon page |
| SelfHumanProofProvider | `0x4b036aFD959B457A208F676cf44Ea3ef73Ea3E3d` | `0x5E61c3051Bf4115F90AacEAE6212bc419f8aBB6c` | Self smart-contracts page (code not checked) |
| Altana KeyStore | `0x83b30935f36d6ccf9B1ec3b5E47F2866b97cd27c` | `0xCC3df52B6aD826781AAD86EcEB1459ed0b1Ae3F6` | Altana networks page; hackathon page |
| Altana KeyStoreController | `0x47bA5fc2A5b0CcB24BA3fAC9D4B59400eE9fd1D6` | `0x54eAb49d805336DB8591BAAF9ac630D0A58Ad2cD` | Altana |
| Altana relay | `https://relay.altana.network` | `https://testnet-relay.altana.network` | Altana |
| Textile LimitOrderReactor | `0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3` | **none.** Textile has no reactor on Celo Sepolia | Textile llms-full + hackathon page |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | same | x402 skill.md |
| ERC-4337 EntryPoint v0.6 / v0.7 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` / `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | — | attribution-tags INDEXERS.md (code not checked) |

### x402 facilitator (Celo Core Co., hosted) [V]
- Mainnet API `https://api.x402.celo.org`, testnet `https://api.x402.sepolia.celo.org`, dashboard `https://x402.celo.org`, config `GET https://x402.celo.org/api/config`.
- `GET /supported` (live 24 Nov): `x402Version: 2`, scheme `exact`. Mainnet assets: USDC, USDT, USAT, wARS, wBRL, wMXN, wCOP, wPEN, wCLP, cNGN. Sepolia: USDC only. Top-level `extensions: ["eip2612GasSponsoring","payment-identifier"]`.
- **Settlement signer** (from `/supported` → `signers`): `0x0d74D5Cefd2e7F24E623330ebE3d8D4cB45fFB48` on **both** networks. Live check: recent mainnet settlements are txs `from` this address, `to` the token, selector `0xe3ee160e` = `transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)`. They emit `AuthorizationUsed` and carry **no attribution tag**. The bytes-signature variant `0xcf092995` is used for ERC-1271 smart-account payers [V selector math; whether Celo USDC accepts it, U]. **Always read `signers` from `/supported` at startup and cache it for 1 h. Don't hard-code it.**
- Asset table (authoritative, from skill.md and `/api/config`):

| asset | network | address | extra.name | extra.version | dec | transfer |
|---|---|---|---|---|---|---|
| USDC | mainnet | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | `USDC` | `2` | 6 | eip3009 |
| USDT | mainnet | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | `Tether USD` | `1` | 6 | eip3009 |
| USAT | mainnet | `0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771` | `Tether America USD` | `1` | 6 | eip3009 |
| USDC | Sepolia | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` | `USDC` | `2` | 6 | eip3009 |
| wARS | mainnet | `0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D` | `Peso Argentino` | `1` | 18 | permit2 |
| wBRL | mainnet | `0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0` | `Real Brasileño` | `1` | 18 | permit2 |
| wMXN | mainnet | `0x337E7456B420bD3481e7FA61fA9850343d610d34` | `Peso Mexicano` | `1` | 18 | permit2 |
| wCOP | mainnet | `0x8a1D45e102e886510e891d2Ec656a708991e2D76` | `Peso Colombiano` | `1` | 18 | permit2 |
| wPEN | mainnet | `0x4F34c8b3b5FB6D98Da888F0feA543d4d9C9F2eBE` | `Sol Peruano` | `1` | 18 | permit2 |
| wCLP | mainnet | `0x61D450a098b6a7f69fC4b98CE68198fe59768651` | `Peso Chileno` | `1` | 18 | permit2 |
| cNGN | mainnet | `0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f` | `cNGN` | `1` | 6 | permit2 (no EIP-2612, so **no** gas-sponsoring extension) |

- **Fee-currency adapters, which must never be priced against** (lint error): USDT adapter `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72` (18 dec), USAT adapter `0x0357EE22278c922e1D36cFe6b899269b161880C4` (18 dec), USDC adapter `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` [V skill.md].
- Other Textile corridor tokens on Celo: IDRX `0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22` (Textile says **2 decimals**), COPM `0xC92E8Fc2947E32F2B574CCA9F2F12097A71d5606` [V Textile address book]. Textile's Celo corridors include cNGN/wARS/wBRL/wMXN/wCOP/IDRX ↔ USDT. The hackathon only lists **USD₮ ↔ cNGN, IDRX, wARS, wBRL, wMXN, wCOP**.

### Event topics and selectors (computed with viem 2.58 on 24 Nov) [V math]
| Item | Value |
|---|---|
| ERC-8004 `Registered(uint256 indexed agentId, string agentURI, address indexed owner)` | `0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a` |
| ERC-20 `Transfer(address,address,uint256)` | `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` |
| EIP-3009 `AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)` | `0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5` |
| Altana `KeyRegistered(address indexed user, bytes32 indexed keyId, address indexed validator, uint40 expiry, bool isRoot)` | `0x9cd59dd65b7552c8a0b81bf6f9beee2eba669ab1957be114308eba6bf28975cf` (ABI from altana-sdk `packages/wallet/src/internal/keystore.ts`) |
| UniswapX `Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)` | `0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66` **[V 24 Nov 2026.** Textile tx `0x6bd2226f9a1b6572bf18f6aee75180020e8c5376dc23327394d44a3e9e9d0e71` emits this topic. Indexed `filler` equals `tx.from`. Indexed `swapper` is the counterparty that sent USDT to `tx.from`. Call selector on that tx was `0x0d7a16c3`; the function name is not taken from a cited ABI.**]** |
| ERC-8021 marker (last 16 bytes) | `0x80218021802180218021802180218021` |

---

## 2. Check catalogue (inputs, verification, pass/fail/unknown)

**Status semantics:** `pass` = positive evidence verified on chain or via an authoritative API. `fail` = evidence contradicts the rule, or required evidence is absent where it is fully observable. `warn` = passes, but there's a risk judges may mark down. `unknown` = can't be determined automatically (offchain, private, or a data-source failure). Every result carries `evidence` (tx hashes, block numbers, URLs, raw values) and a `hint` (one concrete fix).

### Common input object (`EntryInput`)
```ts
{
  network: "mainnet" | "testnet",          // default mainnet; testnet runs produce a "practice" report
  tracks: ("t1"|"t2"|"t3"|"t4")[],
  agentWallet: Address,                     // the wallet added to the Loops entry
  teamWallets?: Address[],                  // other team/funder wallets (improves independence check)
  erc8004AgentId?: string,                  // canonical registry tokenId
  selfAgentId?: string,                     // Self registry agentId (T3)
  attributionCode?: string,                 // e.g. "celo_xxxxxxxxxxxx"; default = codeFromRepo(repoUrl) [U]
  repoUrl?: string,                         // https://github.com/owner/repo
  x402Url?: string, x402Method?: "GET"|"POST",
  payTo?: Address,                          // PayTo registered at sign-up
  x402PaymentTxs?: Hash[],                  // hashes submitted for T2/T3
  textileTxs?: Hash[],                      // T1
  altanaWallet?: Address, altanaSessionPublicKey?: Hex, altanaRevokeTx?: Hash, // T4
  xPostUrl?: string,                        // T2/T3
  agentVaultSite?: string                   // T2 (manual)
}
```

### G1 `erc8004.registered`: ERC-8004 identity exists
- Input: `agentWallet`, optional `erc8004AgentId`.
- Verify (canonical registry, ABI from `erc-8004/erc-8004-contracts/abis/IdentityRegistry.json` [V]):
  - With an id: `ownerOf(agentId)`, `getAgentWallet(agentId)`, `tokenURI(agentId)`.
  - Without one: `balanceOf(agentWallet) > 0`, then find the id via `Registered` logs filtered by `topic2 = owner`. Use Blockscout `/api/v2/addresses/{wallet}/token-transfers?type=ERC-721` or the logs API instead of chunking `eth_getLogs` (5k-block cap). The Blockscout v2 path parameters are [U].
  - Also read the Self registry (it implements the ERC-8004 identity interface): `GET https://agent-api.self.xyz/api/agent/agents/{chainId}/{address}` [V endpoint listed in Self REST docs].
- `pass`: canonical-registry token exists on the selected network. `warn`: only a Self-registry identity exists. Hint: "also register on 0x8004A169… to be safe" [U whether judges accept Self registry alone]. `fail`: neither.
- Extra: fetch `tokenURI`. If it's https/ipfs/data, parse the registration JSON (`type` must be `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`; check `services[]`, `x402Support`, `registrations[].agentRegistry == "eip155:42220:0x8004A169…"`) [V format from docs.celo.org]. Bad or missing JSON → `warn`.

### G2 `erc8004.wallet_match`: identity registered from the entry wallet
- `ownerOf(agentId) == agentWallet` OR `getAgentWallet(agentId) == agentWallet`. `register()` sets `agentWallet = msg.sender`, and transferring the NFT clears it [V docs.celo.org].
- `pass` if either matches (note which). `fail` if neither, with the hint "register from the wallet you added to your entry, or `setAgentWallet`".

### G3 `attribution.tags`: every counted tx carries the entry's ERC-8021 tag
- Input: `agentWallet` (+ `teamWallets`), `attributionCode` (default `codeFromRepo(repoUrl)`).
- Source of truth: `@celo/attribution-tags@0.5.0` [V npm]. Exports used: `fromDataSuffix`, `verifyTx`, `fromEntryPointCalldata`, `verifyUserOps`, `codeFromRepo`, `codeFromHostname`, `toDataSuffix`, `withAttribution`, `ERC_8021_MARKER`.
- Decode rules [V INDEXERS.md]:
  - **Schema 0** (apps): `[codes ascii, comma-separated][len:1][0x00][marker:16]`.
  - **Schema 2** (facilitators): `[CBOR {a,w,s}][len:2][0x02][marker]`. Schema 1 = untagged for our purposes.
  - For ERC-4337 `handleOps` (selectors `0x1fad948c` v0.6, `0x765e827f` v0.7), use `fromEntryPointCalldata` and credit each op's `sender`.
- Algorithm:
  1. List outgoing txs of each wallet ascending (Blockscout `?module=account&action=txlist&address=…&sort=asc`, page through, cap 1,000 txs).
  2. For each, try `fromDataSuffix(tx.input)`, then the 4337 path.
  3. **Altana wallets:** Altana puts the tag "on the last call that has data" inside a relay batch, so the outer input may not end with the marker [V Altana attribution doc]. Fallback: search for the marker *anywhere* in the input, and decode the slice that ends at the marker (same technique as the 4337 doc).
  4. Txs `from` the facilitator signer are x402 settlements. Exclude them; they're never tagged.
- Output: `firstTaggedTx`, `firstUntaggedTx`, `untaggedBeforeFirstTagged[]`, `tagged/total`, codes seen.
- `pass`: every tx since the first tagged tx carries the expected code, and the expected code was present on the first mainnet tx. `warn`: a different `celo_` code was found (the hint shows both; "Leaderboards only credit the assigned code" [V BUILDERS.md]); or untagged txs exist *before* the first tagged one (those can never be credited). `fail`: no tagged mainnet tx. `unknown`: wallet has no mainnet txs, or the explorer is unavailable.
- `codeFromRepo` = `"celo_" + sha256(lowercase "owner/repo").slice(0,12)` [V sdk source]. Example: `codeFromRepo("dr-winner/preflight") = celo_a1dce2bb4c45` [V computed]. **Whether Loops House issues codes this way is [U].** Always prefer the user-supplied code.

### G4 `repo.public`: public GitHub repo resolves
- `GET https://api.github.com/repos/{owner}/{repo}` (unauthenticated is 60 req/h; use `GITHUB_TOKEN` server-side). `pass`: 200 and `private == false`. `fail`: 404 or private.

### G5 `repo.code_window`: code written from 20 Nov
- Use `created_at` and the oldest commit (GET `/repos/{o}/{r}/commits?per_page=1`, follow the `Link: rel="last"` page). Count commits dated before `2026-11-20T14:00:00Z`, and check whether the repo is a `fork`.
- `pass`: no pre-window commits. `warn`: pre-window commits or a fork (hint: "state in submission what predates 20 Nov"). Never `fail`, because author dates can be forged.

### G6 `mainnet.activity`: there is mainnet activity at all
- `eth_getTransactionCount(agentWallet)` on 42220 > 0, or Blockscout token transfers exist. `fail` on testnet-only (hint: "Only Celo mainnet counts").

### G7 `x402.payto_registered`: PayTo registered at sign-up
- No public API exists for this. Status is always `unknown`, with a checklist item. If `payTo` is supplied, compare it to the `payTo` in the live 402 (see X5).

### G8 `buy.usage` (info, optional)
- Count x402 settlements where the payer is the entrant wallet and the `payTo` belongs to buy's gateway. buy's `payTo` addresses aren't published in the docs [U]. Read them from a live 402 (`POST https://gateway.usebuy.ai/chainstack/celo` with no payment → 402) at startup and cache them.

### G9 `self.recommended` (all tracks, info)
- If `selfAgentId` is given, or the wallet maps to a Self agent (`/api/agent/agents/{chainId}/{address}`), say so. Missing → `warn` with the hint "recommended for all tracks".

### I1 `independence.funding_graph`: payers/recipients outside the team (Assay-style)
- Input: the set of **counterparties**. For x402 sellers these are payers to `payTo`. For T1 they're recipients of local-stablecoin payments. Plus the **team set** `S = {agentWallet, payTo, altanaWallet, teamWallets…} ∪ firstFunder(each team wallet)` (the "main funder" rule).
- How payers are found for x402: token transfers **to** `payTo` (Blockscout `action=tokentx&address=payTo`) where the parent tx `from` is the facilitator signer. Payer = the `Transfer.from` (which equals the `AuthorizationUsed.authorizer`).
- `firstFunder(addr)` = sender of the **earliest inbound transfer with value > 0**, taking the earlier of native CELO (`txlist` asc, `to == addr && value > 0`) and ERC-20 (`tokentx` asc, `to == addr`). Cache it forever per (network, addr).
- Trace up to `N = 3` hops (configurable). Stop when the funder:
  - is in S → **team-funded**;
  - has code (contract: router, pool, facilitator, bridge) → **unknown-origin**;
  - is on `KNOWN_HUBS` (exchange hot wallets, bridges, faucets; starts empty and is curated in config) → **independent**;
  - has > 5,000 txs (hub heuristic) → **independent (likely hub)**.
- Also flag **loops**: any transfer from S to the counterparty *after* its first payment (refund/round-trip), and counterparties that are themselves in S (self-trading).
- Bonus credit: a counterparty with its own ERC-8004 identity (`balanceOf(cp) > 0` on the canonical registry) whose owner isn't in S → independent per R7.
- Output: per counterparty `{status, path:[addr, funder, …], txs}`, plus `independentCount`, `volumeIndependent`.
- `pass` if `independentCount ≥ 1`. `warn` if every counterparty is unknown. `fail` if all are team-funded or looped. **This is a heuristic.** The report must say so ("organisers review activity before judging").
- Cost: each hop is 2 explorer calls. Cap 50 counterparties per check (deep tier only).

### Track 1: Textile FX
- **T1.1 `textile.conversion`.** Input: `textileTxs[]`, or scan the agent wallet for txs to the reactor.
  - The receipt must be `status == success` on 42220, with `tx.to == 0xa9AA0a64…C235b3` (Textile's RFQ `transactions.swap` is an `executeBatch` on the reactor, sent by the taker wallet [V Textile docs]).
  - `tx.from ∈ {agentWallet, teamWallets}`.
  - The logs must contain `Transfer`s of USD₮ (`0x4806…3D5e`) and one listed corridor token (cNGN/IDRX/wARS/wBRL/wMXN/wCOP) touching `tx.from`.
  - The tag must be present (G3 decode on `tx.input`).
  - Textile's own `includeAttribution` puts `textile_api` plus the partner code in the tag. The hackathon FAQ says "leave includeAttribution off so your tag is the only one" [V].
  - A `Fill` event from the reactor is extra evidence [U topic].
  - `pass`: success + corridor + tag. `fail`: no such tx. `warn`: tagged with `textile_api` only.
- **T1.2 `textile.local_payout_independent`.** Local-stablecoin `Transfer`s from team wallets to recipients not in S, run through I1. `pass` if ≥ 1 independent recipient.
- **T1.3 `textile.no_maker_no_arb`.** `warn` if the agent wallet also appears as the Fill `filler` on orders it didn't take, or if round-trip swaps happen within 1 h [heuristic].

### Track 2: Agent Vault
- **T2.1 `x402.payment_hash`:** same as T3.2.
- **T2.2 `agentvault.site`, T2.3 `agentvault.limit_demo`, T2.4 `agentvault.no_secrets`:** `unknown` (manual checklist; Agent Vault exposes no public verification API in the docs we read).
- **T2.5 `x.post`:** see T3.6.

### Track 3: Self Agent ID
- **T3.1 `self.agent_mainnet`.** Input: `selfAgentId`. `GET https://agent-api.self.xyz/api/agent/info/42220/{id}` [V; same call judges make]. Response fields [V live sample on testnet id 5]: `isVerified, hasHumanProof, isProofFresh, proofExpiresAt, proofProvider, verificationStrength, agentAddress, network`.
  - On-chain cross-check on registry `0xaC3D…5944`: `getAgentId(bytes32(agentAddress))`, `isVerifiedAgent(agentKey) && isProofFresh(agentId)` (`isVerifiedAgent` stays true after expiry, so always check freshness [V]).
  - `pass`: verified, fresh, network mainnet. `fail`: not found, or testnet only (hint: "Celo Sepolia accepts mock passports only; register on mainnet with a real passport"). `warn`: expires in < 14 days.
- **T3.2 `x402.payment_hash`.** Input: tx hashes. Get the receipt on 42220.
  - `pass` requires: `status == 1`, `tx.from ∈ facilitatorSigners(42220)` (from live `/supported`), `tx.to ∈ facilitator payment assets`, selector ∈ {`0xe3ee160e`, `0xcf092995`} for eip3009 assets *or* a Permit2 settlement (`tx.to == Permit2` or a facilitator contract) for permit2 assets [U exact permit2 settlement tx shape], plus a `Transfer` to `payTo` (if supplied).
  - Report which side the entrant is on: payer = `Transfer.from` or payee = `Transfer.to` matching team wallets.
  - `fail`: not a facilitator settlement (e.g. a direct transfer).
- **T3.3 `self.gate_in_code`.** Repo static scan (tarball via `GET /repos/{o}/{r}/tarball`, cap 25 MB, max 5,000 files, skip `node_modules`, `dist`). Search for `SelfAgentVerifier`, `.auth(`, `verifier.verify(`, `verifyAgent(`, `isVerifiedAgent(`, `isProofFresh(`, `getHumanNullifier(`, `sameHuman(`, and the `x-self-agent-signature` header. Return `path:line` links (`https://github.com/{o}/{r}/blob/{sha}/{path}#L{n}`).
  - `pass` if the verifier is found in a request path. `warn` if it's only found in tests or docs. Also warn when `sybilLimit` is left at the default of 1 ("default rejects humans with several agents" [V]), and when the code verifies re-serialised JSON rather than the raw body.
- **T3.4 `self.live_gate_probe`** (optional, needs `x402Url`): call the endpoint with **no** Self headers. A 401/403 whose body contains a known SelfAgentVerifier error string (e.g. `Missing agent authentication headers`) → `pass` ("unverified agent turned away"). Otherwise `unknown`.
- **T3.5 `self.shared_limit`:** `unknown` with a checklist item: "show two agents of the same human sharing one limit (group by nullifier)". If the repo scan finds `nullifier` used as a rate-limit key → `warn → pass-likely`.
- **T3.6 `x.post`.** Input: `xPostUrl`. Optional fetch of `https://publish.twitter.com/oembed?url=<post>` [U still served]. Check that the html contains `@selfxyz`, `@Celo` and the repo URL. On failure → `unknown`.
- **T3.7:** G1/G2.

### Track 4: Altana
- **T4.1 `altana.wallet`.** Input: `altanaWallet`. On the Celo KeyStore `0x83b3…d27c`: `getKeys(user) → bytes32[]` and `getKey(user,keyId) → {validator, publicKey, metadata, nonce, lastUpdated, revoked, expiry, isRoot}` [V ABI from altana-sdk hypersigner-keystore-mcp `keystore.ts`]. Plus historic `KeyRegistered` logs (topic1 = user), via Blockscout logs API or chunked `getLogs`.
  - `pass` if ≥ 1 `isRoot == true` key (admin) is registered on 42220. Link `https://explorer.altana.network/account/<wallet>` [V URL pattern].
- **T4.2 `altana.session_key`.** `pass` if ≥ 1 key with `isRoot == false` has `expiry > 0`. Spend cap and allowlist live in the account contract, not the KeyStore, and there is **no documented on-chain read for caps/allowlist** [U]. Report expiry, and mark caps "shown in demo" as an `unknown` checklist item. If the repo scan finds `grantSession({ … permissions: { calls:[…], spend:[…] } })` → evidence link.
- **T4.3 `altana.revoked`.** `pass` if any session key has `getKey(...).revoked == true` (revocation is monotonic [V]) or `isValidKey(user,keyId) == false` with `revoked == true`, and optionally the `altanaRevokeTx` receipt is success. Agent "being stopped" → `unknown` checklist item (demo).
- **T4.4 `altana.tagged`.** Altana txs carry `altana[,appCode…]` [V]. Run G3 with the marker-anywhere fallback, and check that the entry's `celo_` code is in the list (hint: `createClient({ chains:[CELO], appCode: ["my_app", "celo_…"] })` [V]).
- **T4.5:** G1/G2. Note: the Altana SDK auto-registers a new wallet in the ERC-8004 registry as "Altana Agent" unless `agentIdentity` is set or false [V]. Warn if the entry's ERC-8004 id is that default record.

---

## 3. x402 endpoint lint + passive security checks

Input: `x402Url` (+ method). **Preflight never sends a payment and never sends a `PAYMENT-SIGNATURE`/`X-PAYMENT` header.**

### Protocol checks (x402 v2; spec: `coinbase/x402/specs/x402-specification-v2.md`, `transports-v2/http.md`) [V]
| ID | Check | Pass criteria |
|---|---|---|
| X1 | Unpaid request returns `402` | status 402 (GET; POST with empty body `{}` only when the caller sets `x402Method:"POST"`) |
| X2 | `PAYMENT-REQUIRED` header present | base64 → JSON parses. v1 fallback: JSON body with `x402Version:1` → `warn` "legacy v1; use @x402/* v2" |
| X3 | Shape | `x402Version == 2`; `resource.url` present (and equals the probed URL modulo trailing slash; else warn); `accepts[]` non-empty; each entry has `scheme`, `network`, `amount` (string of digits), `asset`, `payTo`, `maxTimeoutSeconds` (number), `extra` |
| X4 | Network | `network == "eip155:42220"` for mainnet runs. `eip155:11142220` → `fail` on mainnet ("testnet doesn't count"), `pass` on practice runs |
| X5 | payTo | valid checksummed address, ≠ zero, ≠ facilitator signer, ≠ asset. If `payTo` input given → must match (else `fail`, "PayTo you registered differs") |
| X6 | Asset | ∈ live `/supported` `extra.supportedAssets` for the network. Fee-currency adapter addresses → `fail` (10^12 error) |
| X7 | EIP-712 domain | `extra.name`/`extra.version` equal the table values (e.g. USDT is `Tether USD`/`1`, not the symbol) |
| X8 | Permit2 assets | `extra.assetTransferMethod == "permit2"`. For wARS/wBRL/wMXN/wCOP/wPEN/wCLP the 402 body has `extensions.eip2612GasSponsoring` (else `fail`: "every fresh wallet gets 412 permit2_allowance_required"). For **cNGN** it must be absent |
| X9 | Amount sanity | > 0. Amounts above 1,000,000 base units on USDC/USDT/USAT → `warn` (stock `@x402/fetch` clients refuse > $1 without `spendControls.maxAmountPerPayment`) [V skill.md] |
| X10 | Facilitator reachability | `GET {facilitator}/supported` returns 200 and lists `exact` for the network |
| X11 | Seller history | `payTo` has ≥ 1 settled payment from the facilitator signer (Blockscout tokentx to payTo, parent tx from signer) → info: count, first/last date |
| X12 | Self-gated? | response 401/403 with a SelfAgentVerifier error string → note "Self-gated endpoint" (feeds T3.4) |
| X13 | CORS for browser buyers | if `Access-Control-Allow-Origin` is present: `Access-Control-Expose-Headers` includes `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`; preflight `OPTIONS` allows `PAYMENT-SIGNATURE` (and `X-PAYMENT` for v1 clients). Missing → `warn` |

Note: skill.md prose still names the `X-PAYMENT` / `X-PAYMENT-RESPONSE` headers while the v2 spec uses `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`, and the Altana client sends both. The lint must accept both [U which ones @x402/hono 2.32 emits; confirm by running our own server in unit 4].

### Passive security checks (only on the exact host the user supplied; no path guessing on the passive tier)
| ID | Check | Criteria |
|---|---|---|
| S1 | HTTPS | scheme https; `http` → `fail` |
| S2 | TLS | handshake OK, cert valid for the host, not expiring < 14 days, protocol ≥ TLS1.2 (Node `tls.connect` to the **pinned IP** with `servername`) |
| S3 | HSTS | `Strict-Transport-Security` with `max-age ≥ 15552000` → pass; missing → warn |
| S4 | Headers | `X-Content-Type-Options: nosniff`; no `X-Powered-By`; `Server` without a version; JSON responses `Content-Type: application/json` |
| S5 | CORS | `Access-Control-Allow-Origin: *` together with `Access-Control-Allow-Credentials: true` → `fail`; reflected arbitrary Origin (send `Origin: https://preflight-probe.invalid`) with credentials → `fail` |
| S6 | Error hygiene | 402/4xx body doesn't contain stack-trace patterns (`at .* \(.*:\d+:\d+\)`, `Traceback`, `/node_modules/`) |
| S7 | Secret leak in body | regex for `x402_[A-Za-z0-9]{16,}`, `0x[0-9a-fA-F]{64}` next to `key|secret|private`. Report the **location only**, never the value |
| S8 (deep tier only, needs repo ownership proof = Self-verified agent whose `agentWallet` owns the entry's ERC-8004 id) | Exposed files | `GET /.git/HEAD`, `GET /.env` on the same origin: 200 with a recognisable body → `fail` |

### SSRF and abuse protections (mandatory, unit-tested)
1. URL parse with WHATWG `URL`. Reject: userinfo, non-`http(s)` schemes, ports other than 443/80/8443, hostnames `localhost`, `*.localhost`, `*.local`, `*.internal`, `metadata.google.internal`, and any raw-IP host (the user must give a DNS name).
2. Resolve DNS ourselves (`dns.promises.lookup(host, {all:true})`). **Every** A/AAAA must be public. Use `ipaddr.js` `range()`: only `unicast` passes. Explicitly block 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16 (incl. 169.254.169.254), 172.16/12, 192.0.0/24, 192.0.2/24, 192.88.99/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 255.255.255.255, ::, ::1, fc00::/7, fe80::/10, ff00::/8, 2001:db8::/32, 100::/64, 64:ff9b::/96 (NAT64) and IPv4-mapped `::ffff:0:0/96` (check the embedded v4).
3. **DNS-rebinding guard:** connect to the validated IP only. Use an undici `Agent` with `connect: { lookup }` that returns the pre-validated address, and pass `servername` for TLS SNI.
4. Redirects: `redirect: "manual"`, max 3 hops, re-validate every hop (steps 1–3).
5. Limits: connect timeout 3 s, total 8 s; response body cap 256 KiB (abort the stream); header size cap 16 KiB; ≤ 6 outbound requests per check; per-target-host limit 10 checks/min across all customers; per-payer limit 30 checks/h.
6. Outbound request hygiene: fixed `User-Agent: PreflightBot/1.0 (+https://<PUBLIC_BASE_URL>/bot)`; no cookies; never forward any inbound header; method allowlist GET/HEAD/OPTIONS (+ POST `{}` only when requested).
7. Run outbound probes in a worker with no access to DB credentials or env secrets (separate `probe` module that receives only the URL).

---

## 4. Preflight's own integrations

### 4.1 x402 seller (Hono, `@x402/*` v2)
- Packages: `@x402/hono`, `@x402/core`, `@x402/evm` (npm latest **2.32.0** on 24 Nov [V]; skill.md verified against ≥ 2.23; `celo-org/x402-celo-example` pins 2.27.0). Pin an exact version.
- Pattern [V skill.md + example `src/seller.ts`]:
  - `new HTTPFacilitatorClient({ url, createAuthHeaders: async () => ({ verify:h, settle:h, supported:h }) })` with `h = {"X-API-Key": X402_API_KEY}`.
  - `const server = new x402ResourceServer(facilitator); server.register("eip155:*", new ExactEvmScheme())`.
  - `app.use(paymentMiddleware(routes, server))`: **routes first**, then server. `payTo` and an explicit price object go inside each `accepts`. **Never a bare `"$0.01"`.**
- Prices (atomic, 6-decimal):
  - passive **$0.01** = `"10000"`;
  - deep **$0.05** = `"50000"`.
  - Mainnet `accepts` lists both USDC (`USDC`/`2`) and USDT (`Tether USD`/`1`). Sepolia lists USDC `0x01C5…C44E` only.
- After settlement, persist the `PAYMENT-RESPONSE` (tx hash, payer, network) to `payments`.
- Ops: the facilitator gives 1,000 free testnet credits and up to 100 mainnet credits (mainnet needs **GitHub sign-in at key creation**). After that it's gas + 0.3%, prepaid in USDC. `insufficient_credits` → 402 from `/settle` [V].

### 4.2 Self Agent ID gate (Track 3 core)
- `@selfxyz/agent-sdk@0.3.1` [V]. Build the verifier once:
  ```ts
  SelfAgentVerifier.create().network(NETWORK==="mainnet"?"mainnet":"testnet").sybilLimit(0).replayProtection(true).build()
  ```
  `sybilLimit(0)` so we group by `nullifier` ourselves [V docs].
- Hono adapter: read `const raw = await c.req.text()` **before** anything parses JSON. Call `verifier.verify({ signature, timestamp, method, url: pathWithQuery, body: raw, keytype, agentKey })` with headers `x-self-agent-signature|timestamp|keytype|key` [V]. On a thrown error → 503. Use the result's `valid, agentId, agentAddress, nullifier, agentCount`. Hono body caching after `text()` is [U]. Re-parse from `raw`.
- Replay protection in the SDK is per process. Also persist `(signature)` with a unique index in Postgres (`self_seen_sigs`, 10-min TTL) for multi-instance.
- Policy:
  - **No Self headers** → passive tier only. `POST /v1/preflight/deep` returns **403** `{error:"deep_checks_require_verified_human", detail:"Register your agent with Self Agent ID (mainnet) and sign requests", passive:"/v1/preflight/passive"}`. **This is the demo's "unverified agent turned away" moment.**
  - Invalid Self headers → 401 with the SDK's error string.
  - **Verified** → deep tier allowed. **1 free deep check per human (nullifier)**, shared across all that human's agents:
    ```sql
    UPDATE humans SET free_used = free_used + 1 WHERE nullifier = $1 AND free_used < $FREE RETURNING …
    ```
    Upsert the human row first. If a row comes back → serve free (skip payment). Otherwise → delegate to the x402 middleware for the deep route (paid). If the check later fails internally, refund the free slot.
  - Per-human daily cap: 20 deep checks/day across all their agents (paid or free). Over the cap → 429.
- Route wiring:
  ```ts
  app.post("/v1/preflight/deep", selfGate, requireVerified, (c,next)=> consumeFree(c) ? next() : payDeep(c,next), deepHandler)
  ```
  where `payDeep = paymentMiddleware(deepRoutes, server)`. Mounting the x402 middleware per-route/conditionally is [U]. Fallback: two internal routes, `/deep` (paid) and `/deep-free` (internal rewrite), both behind the Self gate.
- **Code-location requirement:** the gate must live in one obvious file (`apps/api/src/gates/self.ts`) with a top-of-file comment, so the submission can link `file#Lnn`.

### 4.3 Preflight's ERC-8004 identity
- **Order of operations (mainnet, ~28 Nov):**
  1. Dr Winner registers the Preflight agent with Self Agent ID on **mainnet** using mode `linked` (server-generated EVM agent key; NFT owner = Dr Winner's wallet) [V modes table]. Ghana passports are **supported** (Full Support DSC+CSCA) [V supported-countries page].
  2. `session.exportKey()` (within 30 min) → `AGENT_PRIVATE_KEY`.
  3. From that same key, call the canonical registry `register(agentURI)` on `0x8004A169…a432`. Parse `Registered` for the agentId [V code in docs.celo.org].
  4. Wrap the wallet client with `withAttribution(ATTRIBUTION_CODE)` **before** step 3, so the registration tx is tagged.
  - Gas in CELO, or via the fee-currency USDC adapter `0x2F25…602B` [V docs].
- Testnet: same flow with a **mock passport** on Celo Sepolia [V docs; mainnet rejects mock and Sepolia rejects real].
- `agentURI` → `https://<PUBLIC_BASE_URL>/.well-known/agent-registration.json` (path is our choice; the spec doesn't mandate one [V]):
  ```json
  {"type":"https://eips.ethereum.org/EIPS/eip-8004#registration-v1","name":"Preflight","description":"Checks Celo hackathon entries against track must-haves; signed reports.","services":[{"name":"web","endpoint":"https://<host>"},{"name":"MCP","endpoint":"https://<host>/mcp","version":"2025-06-18"}],"x402Support":true,"active":true,"supportedTrust":["reputation"],"registrations":[{"agentId":<id>,"agentRegistry":"eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}],"reportSigner":"0x…"}
  ```
- `SELLER_PAY_TO` = the agent address (earnings land in the agent wallet). Dr Winner registers this PayTo at Loops sign-up.

### 4.4 Attribution on all our txs
- One factory, `packages/chain/src/wallet.ts`: `createWalletClient(...).extend(withAttribution(ATTRIBUTION_CODE))` [V API]. A lint rule (eslint `no-restricted-imports` / `no-restricted-syntax`) bans `createWalletClient` anywhere else.
- At startup, refuse to boot on mainnet if `ATTRIBUTION_CODE` is unset or doesn't match `/^celo_[0-9a-f]{8,12}$/`. Log whether it equals `codeFromRepo("dr-winner/preflight")` (`celo_a1dce2bb4c45`).
- Altana client: `createClient({ chains:[CELO], appCode: ["preflight", ATTRIBUTION_CODE] })` [V]. (Altana prepends `altana`.)
- A CI test sends a tx on a local anvil fork and asserts `fromDataSuffix(input).codes` contains the code.

### 4.5 Altana spending wallet + buy (Track 4)
- **Job:** Preflight's deep-check worker buys **archive Celo RPC** for funding-graph traces from buy's Chainstack route: `POST https://gateway.usebuy.ai/chainstack/celo`, **0.01 USDC per batch of up to 2,000 JSON-RPC calls**, body ≤ 128 KiB, mainnet, assets USDC/USDT/USAT [V PAY.md]. It falls back to forno/Blockscout when unpaid.
- **Setup (script `scripts/altana-setup.ts`, run by Dr Winner; admin key never on the server):**
  - `createClient({ chains:[CELO], appCode:[...], agentIdentity:{ name:"Preflight (spending wallet)", description:"Altana wallet used by Preflight agent #<id>", endpoint: PUBLIC_BASE_URL } })`.
  - `createWallet({ signer: admin })`, then fund it with ~2 USDC + a little CELO.
  - `grantSession`:
    ```ts
    client.grantSession({ wallet, signer: admin, sessionSigner: signerFromPrivateKey(SESSION_KEY),
      permissions: { calls: [{ to: USDC }], spend: [{ token: USDC, limit: 1_000_000n /* 1 USDC */, period: "day" }] },
      expiry: now + 14*86400, x402Tokens: [USDC], feeToken: USDC })
    ```
    Persist with `serializeSession` (no secret) [V grantSession docs].
  - The spend cap **also pays relay fees**, so leave headroom [V].
- **Paying:** `client.fetchWithX402({ session, url, … })` [V API]. The SDK enforces the cap for x402 payments, because x402 doesn't pass through `execute` [V]. It throws `spend_limit_exceeded` when over the cap.
  - The eip3009 rail on a smart account requires the token's EIP-3009 to be ERC-1271-aware, and Celo USDC's behaviour here is **[U]**.
  - **Fallback if buy rejects:** the agent pays a Preflight-owned "data relay" route instead, or shows on-chain cap enforcement via `client.execute` of a USDC `transfer` above the cap (the account rejects it at validation).
- **Revoke demo:** `client.revokeSession({ wallet, signer: admin, session })` → `transactionHash` [V]. Then the worker's next `fetchWithX402`/`execute` fails. Show `isValidKey(wallet, keyId) == false` and the Altana explorer key page flipping to "revoked". The worker catches the error, marks `rpc_mode = "free-fallback"`, and the next report shows a "degraded data source" banner.
- Testnet: `CELO_SEPOLIA` config (KeyStore `0xCC3d…e3F6`, relay `testnet-relay`) [V]. buy has a Celo Sepolia sandbox (`usebuy.ai/docs#sandbox`) [U route details].

### 4.6 Signed reports
- Canonicalise the report JSON with RFC 8785 JCS (`canonicalize` npm). `digest = sha256(canonical)`.
- Signature = EIP-191 `personal_sign` by `REPORT_SIGNER_PRIVATE_KEY` over the string `"Preflight report v1\n" + reportId + "\n" + digestHex` (viem `signMessage`; verify with `verifyMessage`).
- Publish the signer address in `/v1/info` and the registration JSON. Optionally also `setMetadata(agentId, "preflightReportSigner", abi.encode(address))` on the identity registry [V `setMetadata` exists in ABI].
- Reports are public at `/v1/reports/:id` (an unguessable UUIDv7 + 128-bit suffix) and expire after 30 days.

---

## 5. Architecture

```
preflight/  (pnpm workspaces, Node 22, TypeScript strict, ESM)
├─ apps/
│  ├─ api/            Hono server: routes, x402 middleware, Self gate, quotas
│  └─ web/            Next.js (App Router) landing + docs + public report viewer
├─ packages/
│  ├─ config/         network switch (testnet|mainnet) → typed constants (§1); zod-validated env
│  ├─ chain/          viem clients, attributed wallet factory, ABIs, readers: erc8004, self, x402settle, altana, textile, tags
│  ├─ explorer/       Blockscout client (rate-limited, cached), first-funder tracer, buy-RPC client (paid via Altana)
│  ├─ checks/         pure check functions → CheckResult; track rule tables; report builder; signer
│  ├─ probe/          SSRF-safe fetcher + x402 lint + passive security checks (no secrets in scope)
│  ├─ db/             Drizzle schema + migrations (Postgres)
│  ├─ mcp/            MCP server (@modelcontextprotocol/sdk + @x402/mcp paid tools)
│  └─ agent/          Altana session runner, buy client, demo scripts (buyer agents A/B/unverified)
├─ scripts/           register-erc8004.ts, altana-setup.ts, altana-revoke.ts, demo-*.ts
├─ docs/              SPEC.md (this file), DEMO.md, SUBMISSION.md
└─ CHANGELOG.md
```
Versions on npm, 24 Nov [V]: hono 4.13.21, drizzle-orm 0.45.4, @modelcontextprotocol/sdk 1.32.2, @x402/mcp 2.32.0, @celo/buy 0.8.7 (Node 22+), @altananetwork/sdk 1.2.0, @selfxyz/agent-sdk 0.3.1, @celo/attribution-tags 0.5.0, viem 2.x.

### Network switch (`packages/config`)
`NETWORK=testnet|mainnet` selects chainId, CAIP-2, RPC, explorer base, facilitator URL, x402 assets, Self network name, Altana config (`CELO_SEPOLIA` | `CELO`), ERC-8004/Self/KeyStore addresses and the Textile reactor (null on testnet, so T1 checks return `unknown` with "Textile has no Celo Sepolia reactor"). Checks take a `network` parameter, so a mainnet-hosted server can still run "practice" checks against Sepolia data on request.

### Data model (Drizzle / Postgres)
```
humans          (nullifier text pk, first_seen_at, free_used int default 0, deep_today int, deep_day date)
self_agents     (chain_id int, agent_id text, agent_address text, nullifier text fk, last_seen_at, pk(chain_id, agent_id))
self_seen_sigs  (signature text pk, seen_at)                                   -- replay guard, TTL 10 min
checks          (id uuid pk, created_at, network, tier enum(passive,deep), input jsonb, status enum(queued,running,done,error),
                 payer text null, payment_tx text null, free boolean, self_agent_id text null, nullifier text null,
                 report_id uuid null, error text null)
reports         (id uuid pk, check_id fk, created_at, expires_at, network, summary jsonb, report jsonb,
                 digest text, signature text, signer text)
check_results   (report_id fk, track text, check_key text, status enum(pass,fail,warn,unknown), evidence jsonb, hint text,
                 pk(report_id, check_key))
payments        (tx_hash text pk, network, route, payer, pay_to, asset, amount numeric, settled_at)
data_spend      (id uuid pk, created_at, provider text, url text, amount numeric, asset text, receipt jsonb,
                 session_key_id text, status text)                             -- Altana/buy purchases
funder_cache    (network, address, funder text null, kind enum(native,erc20,none), tx_hash, block bigint, checked_at,
                 pk(network,address))
tag_cache       (network, tx_hash pk, codes text[] null, schema int null)
```

### API surface (`apps/api`)
| Method | Path | Gate | Price | Notes |
|---|---|---|---|---|
| GET | `/health` | none | free | |
| GET | `/v1/info` | none | free | network, prices, accepts, report signer, ERC-8004 + Self agent ids, payTo |
| GET | `/.well-known/agent-registration.json` | none | free | ERC-8004 registration file |
| POST | `/v1/preflight/passive` | x402 | $0.01 | body `EntryInput`; runs G1–G7, G9, X*, S1–S7, T3.1, T3.2, T4.1–T4.4 (all cheap reads) |
| POST | `/v1/preflight/deep` | Self verified + (free slot or x402) | $0.05 | adds I1 funding graph, repo scan (G4/G5/T3.3/T4.2 code evidence), T1.*, S8; async if > 20 s (returns `202 {checkId}`) |
| GET | `/v1/checks/:id` | none | free | status poll |
| GET | `/v1/reports/:id` | none | free | signed report JSON |
| POST | `/v1/reports/verify` | none | free | `{report, signature}` → `{valid, signer}` |
| GET | `/v1/quota` | Self verified | free | remaining free deep checks for this human, today's deep count |
| ALL | `/mcp` | x402 per tool | per tool | Streamable HTTP MCP |

Report shape:
```json
{ "reportId":"…","version":1,"network":"mainnet","generatedAt":"ISO","input":{…redacted…},
  "summary":{"t3":{"status":"fail","blocking":["t3.self_agent_mainnet"]},"t4":{…},"global":{…}},
  "results":[{"key":"g3.attribution.tags","track":"global","status":"warn","evidence":{…},"hint":"…"}],
  "checklistManual":["Show the revoke tx and agent stopping in your demo", "…"],
  "dataSources":{"rpc":"buy-chainstack|forno","explorer":"blockscout"},
  "disclaimer":"Heuristic pre-check; organisers decide eligibility.",
  "signer":"0x…","digest":"0x…","signature":"0x…" }
```

### MCP server (`packages/mcp`, mounted at `/mcp`)
- `@x402/mcp` `createPaymentWrapper(resourceServer, { accepts })` around paid tools [V README]. Payments travel in `_meta["x402/payment"]`, and receipts come back in `_meta["x402/payment-response"]` [V transports-v2/mcp.md].
- Tools: `preflight_passive` (paid $0.01), `get_report` (free), `explain_requirement` (free; returns the rule text from §0 plus the fix hint).
- `preflight_deep` over MCP is a **stretch goal**, because Self headers must sign the HTTP body. Initially the tool returns a deep-link to the HTTP endpoint.
- Publish install snippets for Claude Code / Cursor in the docs.

### Env vars (names only)
`NETWORK`, `PUBLIC_BASE_URL`, `PORT`, `DATABASE_URL`, `X402_API_KEY`, `SELLER_PAY_TO`, `PRICE_PASSIVE_ATOMIC`, `PRICE_DEEP_ATOMIC`, `FREE_DEEP_CHECKS_PER_HUMAN`, `DEEP_CHECKS_PER_HUMAN_PER_DAY`, `AGENT_PRIVATE_KEY`, `REPORT_SIGNER_PRIVATE_KEY`, `ATTRIBUTION_CODE`, `ERC8004_AGENT_ID`, `SELF_AGENT_ID`, `CELO_RPC_URL`, `CELO_SEPOLIA_RPC_URL`, `BLOCKSCOUT_API_BASE`, `GITHUB_TOKEN`, `ALTANA_WALLET_ADDRESS`, `ALTANA_SESSION_PRIVATE_KEY`, `ALTANA_SESSION_JSON`, `BUY_RPC_URL`, `DATA_SPEND_DAILY_LIMIT_ATOMIC`, `KNOWN_HUBS_JSON`, `LOG_LEVEL`. Script-only, never deployed: `ALTANA_ADMIN_PRIVATE_KEY`, `DEMO_AGENT_A_KEY`, `DEMO_AGENT_B_KEY`, `DEMO_UNVERIFIED_KEY`, `DEMO_BUYER_PRIVATE_KEY`.

---

## 6. Build plan: 9 units, each one GitHub issue → branch → PR

Today is Tue 24 Nov. Goal: **paid endpoint live on Sepolia by Thu 26 Nov and on mainnet by Sat 28 Nov.** Every PR updates `CHANGELOG.md` and has passing CI (typecheck, lint, vitest).

| # | Issue / PR | Target | Acceptance criteria (verifiable) |
|---|---|---|---|
| 1 | **Scaffold + config switch + CI** | Tue 24 Nov | pnpm workspace builds; `packages/config` exports both network tables from §1 with zod env validation; GitHub Actions runs typecheck/lint/test; `CHANGELOG.md`, `docs/SPEC.md`; README states testnet/mainnet switch. `pnpm test` green. First commit authored by `dr-winner` (verify `git log --format='%an <%ae>'`). |
| 2 | **Chain readers + tag decoder (fixtures from real txs)** | Wed 25 Nov | `packages/chain` readers for ERC-8004 (ownerOf/getAgentWallet/tokenURI/balanceOf), Self registry + REST, x402 settlement detector (reads `/supported` signers), Altana KeyStore (getKeys/getKey/isValidKey), Textile tx classifier. Tag decoder wraps `@celo/attribution-tags` + marker-anywhere fallback. Tests use **recorded** mainnet fixtures: the two Mondeto txs from INDEXERS.md decode to `celo_ce264747447f`; a live facilitator settlement decodes as x402 (from `0x0d74…`, selector `0xe3ee160e`); testnet Self agent 5 reads verified. A test asserts forno's 5k-block chunking. |
| 3 | **Check engine + report signer + DB** | Wed 25 Nov | `packages/checks` implements G1–G7, G9, T3.1, T3.2, T4.1–T4.4 as pure functions over reader interfaces (mockable). Report builder + JCS + EIP-191 signer; `verify` round-trip test. Drizzle schema + migration applied to local Postgres (docker compose). Golden-file tests for one passing and one failing synthetic entry. |
| 4 | **Hono API + x402 passive endpoint on Sepolia + SSRF-safe probe & lint** | **Thu 26 Nov** | `POST /v1/preflight/passive` returns 402 with a valid v2 `PAYMENT-REQUIRED` (decoded in test); `scripts/demo-buyer.ts` (`@x402/fetch`, Sepolia USDC) pays and gets a signed report; `PAYMENT-RESPONSE` tx visible on Sepolia explorer and stored in `payments`. `packages/probe` passes an SSRF test-suite (≥ 25 cases: private v4/v6, mapped, NAT64, metadata IP, rebinding via mocked resolver, redirect to private, oversize body, slow loris timeout). X1–X13 and S1–S7 run against our own endpoint and a deliberately misconfigured fixture server. Deployed to a public HTTPS host (testnet). |
| 5 | **Self gate + per-human quota + deep tier** | Fri 27 Nov | `apps/api/src/gates/self.ts` with raw-body verification; unsigned deep request → 403 JSON; demo agents A and B (same mock-passport human on Sepolia) → A's first deep check is free, B's deep check returns a 402 (shared limit by nullifier); unverified agent → 403. Postgres replay guard. I1 funding-graph + repo scan (G4/G5/T3.3) implemented with Blockscout + GitHub; integration test on a known public repo. |
| 6 | **Mainnet cutover: identity, tags, paid endpoint live** | **Sat 28 Nov** | Dr Winner completes: Loops enrollment (gets `ATTRIBUTION_CODE`, registers PayTo), x402 mainnet API key (GitHub sign-in), Self mainnet registration (passport, `linked`). Then: `scripts/register-erc8004.ts` registers on `0x8004A169…` from the agent key via the attributed client; tx decodes with our code; agent visible on 8004scan. Mainnet `/v1/preflight/passive` accepts USDC/USDT; one real paid call settles (hash recorded). `/v1/info` shows mainnet ids. Repo flipped public at registration. |
| 7 | **MCP server (paid tools)** | Sun 29 Nov | `/mcp` lists tools; `preflight_passive` returns `_meta["x402/payment-response"]` after an `@x402/mcp` client pays; `get_report`/`explain_requirement` free. Install snippet in docs tested with one MCP client. |
| 8 | **Altana spending wallet + buy RPC + revoke** | Mon 30 Nov–Tue 1 Dec | `scripts/altana-setup.ts` creates the wallet, grants a session (cap 1 USDC/day, `calls:[USDC]`, 14-day expiry); worker buys archive-RPC batches from buy via `fetchWithX402` (or the documented fallback); purchases are logged in `data_spend`; over-cap attempt throws `spend_limit_exceeded`; `scripts/altana-revoke.ts` revokes; next purchase fails; `isValidKey` false; worker falls back to free RPC and the report shows the banner. All Altana txs decode with `altana,preflight,<celo_code>`. Explorer links captured in `docs/SUBMISSION.md`. |
| 9 | **Landing/docs, demo, launch kit** | Wed 2–Fri 4 Dec (before AskBots round 2 on 4 Dec) | Next.js site: what it checks (rule table §0), pricing, curl/MCP quickstart, live report viewer, honest stats page (paid calls, independent payers, data spend read from chain). `docs/DEMO.md` (§7), `docs/SUBMISSION.md` with every hash, agentId, file#line. Draft X post + Telegram announcement for Dr Winner (not posted by the agent). |

Buffer: Sat 5–Sun 6 Dec for fixes, the demo recording, and submission before **Mon 7 Dec 09:00 GMT**.

---

## 7. Demo video script (≈3 min), covering every T3 and T4 must-have

0. **Hook (10 s):** "Missing one must-have means your track isn't scored. Preflight checks your entry before judges do."
1. **ERC-8004 identity (T3, T4):** show `8004scan.io` for Preflight's agent id on Celo mainnet, plus `ownerOf` = agent wallet.
2. **Self Agent ID on mainnet (T3.1):** terminal: `curl https://agent-api.self.xyz/api/agent/info/42220/<SELF_AGENT_ID>` → `isVerified: true`, `strengthLabel: passport`.
3. **Unverified agent turned away (T3.4):** the `demo-unverified` agent calls `POST /v1/preflight/deep` → **403** "deep checks require a verified human". It's offered passive only. *(Self's demo tip: show the rejection.)*
4. **Verified agent pays via x402 (T3.2):** verified agent A runs a passive check → 402 → pays $0.01 USDC → signed report. Show the `PAYMENT-RESPONSE` hash on celoscan: `from 0x0d74…` (Celo facilitator), `Transfer` to our payTo.
5. **Shared per-person limit (T3.3):** agent A gets its free deep check. Agent B (**same human**, different key) asks for a free deep check → told the free check was used by its human and gets a 402. B pays $0.05 → report. Cut to `apps/api/src/gates/self.ts#Lnn` (SelfAgentVerifier + nullifier quota).
6. **The report itself (value prop):** walk one real entrant's report. Track 4 fails because the session key has no expiry, and the hint shows how to fix it. Signature verified via `/v1/reports/verify`.
7. **Altana wallet (T4.1):** `explorer.altana.network/account/<ALTANA_WALLET>`, admin key + session key.
8. **Session key limits (T4.2):** show the grant code (cap 1 USDC/day, allowlist `[USDC]`, 14-day expiry) and the explorer key page with expiry. The agent buys archive-RPC batches on buy for $0.01 each (data_spend log). Then an over-cap attempt → `spend_limit_exceeded`.
9. **Revoke + agent stopped (T4.3):** Dr Winner runs `altana-revoke.ts` → revoke tx on celoscan → key page shows "revoked". The worker's next purchase fails, `isValidKey` reads false, and the report shows "degraded data source".
10. **Tags (global):** decode one of our txs live with `fromDataSuffix` → our `celo_` code (and `altana,preflight,…` for the Altana tx).
11. **Close (10 s):** "Named users: N entrants checked, M independent paying agents." Repo link, @selfxyz @Celo.

Track 3 X post: Dr Winner posts it from his account (the agent drafts it).

---

## 8. Things only Dr Winner can do (blocking, in order)
1. Create the repo `dr-winner/preflight` (empty, private, no README).
2. Enroll on Loops House → get the **attribution code**, add the agent wallet, **register PayTo** (= `SELLER_PAY_TO`).
3. Create the x402 API key at x402.celo.org: connect a wallet, sign, **choose GitHub sign-in** for mainnet credits.
4. Self app: mock passport for testnet (Thu–Fri). **Real passport scan on mainnet** (~28 Nov; Ghana is supported).
5. Hold the Altana **admin** key and run the setup/revoke scripts (or approve the agent running them).
6. Fund mainnet wallets: about $5 total (CELO gas, ~2 USDC Altana wallet, a few USDC for demo buyer agents, Altana KeyStore registration fee via `registrationFeeUSD`).
7. Follow @Celo and @CeloDevs. Post the Track 3 X post and the launch posts (drafted by the agent).
8. Pick hosting (needs an account; see §11).

## 9. Non-goals
No Agent Vault integration of our own. No Textile swaps of our own. No onchain contract of our own. No path brute-forcing or active vulnerability scanning of third-party hosts. We never send payments to the endpoints we probe.

## 10. Security notes for our own service
- Secrets only in the host's secret store. The admin key never lives on the server.
- Rate limits per IP, payer and nullifier. Raw-body Self verification. Replay table.
- SSRF module isolated (§3). Report inputs redacted (no secrets echoed).
- Dependency pinning plus `pnpm audit` in CI.

## 11. Unverified items / open questions (resolve during the units noted)
1. **Loops attribution code derivation.** Is it `codeFromRepo(owner/repo)` like the Celo Builders platform? Use the code Loops issues; the default derivation is only a guess. (Unit 6)
2. **Does a Self-registry identity alone satisfy "ERC-8004 identity"?** Preflight warns and recommends canonical `0x8004A169…` registration as well. (Ask in hackathon Telegram)
3. **PayTo registration:** no public API to check it, so it's always `unknown`/manual.
4. **RESOLVED 24 Nov 2026.** Textile reactor tx `0x6bd2226f9a1b6572bf18f6aee75180020e8c5376dc23327394d44a3e9e9d0e71` emits `Fill` topic `0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66`. `filler` equals `tx.from` (`0x5Dc9C76C6999C6C604b3D91C040D17b125ca4581`). `swapper` is `0x25A5c1Ae633eB3e1988CfdEed07CdbD2E998AB52`, which sent USDT to the caller while the caller sent wARS. The outer call selector is `0x0d7a16c3`. That name is not copied from a cited ABI, so the reader keys off `tx.to` and the `Fill` log, not the selector.
5. **Permit2 settlement tx shape** from the Celo facilitator (target contract, events) for wARS/wBRL/… payments. Still open. A live mainnet facilitator tx (`0xf913234f8bc6777f2fdd59943d6f8c0b5fd6588f73f0556a05cbd1c548bb9058`) uses selector `0x13cd3b53` and target `0x402085c248eea27d92e8b30b2c58ed07f9e20001` (2913 bytes of code). That target is not Permit2 and not an eip3009 asset in §1, so it is not classified as a settlement. (Unit 2)
6. **Celo USDC and ERC-1271 under EIP-3009.** Can an Altana smart-account session pay x402 on the eip3009 rail (buy gateway and our own endpoint)? If not, use the fallback in §4.5. (Unit 8)
7. **Altana caps/allowlist on chain:** no documented read for a session's spend cap/allowlist. We show them via SDK/code/explorer only. (Unit 8)
8. **Altana relay tx shape on Celo mainnet** (EIP-7702/orchestrator). Still open. One data point from 24 Nov 2026: `KeyRegistered` for user `0x65B6Be7f24aB649267A4F2e5Ac4fBf1b16B31140` is inside tx `0x29f87ec5e0bd83ba7e6058680b677afb15578d9f53abdfa67718a2c2a061c207`, whose `from` is `0x0b479179781640c1c62fe845dcaab1689cb4985c` and whose `to` is `0xaf140d0416a994aebb3fa6212b16ce6700f09751` (selector `0x09c5eabe`). No cited ABI names that target, so it is not added to the network table. The user is not `tx.from`. (Unit 2/8)
9. **buy gateway payTo addresses** and **buy Celo Sepolia sandbox** route details. (Unit 8)
10. **RESOLVED 24 Nov 2026 for our server.** `@x402/hono@2.32.0` returns HTTP 402 with `content-type: application/json` and a `payment-required` header whose base64 JSON has `x402Version: 2`. The lint still accepts `x-payment` as a v1-shaped fallback. Settlement responses are read from `payment-response` or `x-payment-response`.
11. **Conditional/per-route mounting of `paymentMiddleware` in Hono** for the free-slot bypass. A fallback design is given. (Unit 5)
12. **Hono raw-body caching** after `c.req.text()` when other middleware parses JSON. (Unit 5)
13. **RESOLVED 24 Nov 2026 for the paths checked.** `GET https://celo-sepolia.blockscout.com/api?module=account&action=txlist&address=0x043DaCac8b0771DD5b444bCC88f2f8BBDBEdd379&page=1&offset=1&sort=desc` returned `message: OK` and a transaction list. `GET /api/v2/addresses/0xA7F2B8A0Ba50b099Ee2ad16A91176bED96E103F7/token-transfers?type=ERC-721` returned `items`. That v2 response included `x-ratelimit-limit: 180` and `x-ratelimit-remaining`. The header does not by itself say the window length.
14. **X oEmbed** (`publish.twitter.com/oembed`) still serving post HTML for T3.6. (Unit 5)
15. **Assay's** `GET /v1/independent/:address` (free, from a prior entrant) as an optional cross-check. API shape unverified. Also a **competitive-overlap risk**: Assay already offers an independence check, so Preflight's differentiation is the full per-track checklist plus signed fix hints.
16. **Hosting provider and cost** (needs a decision and account from Dr Winner). Suggested: any Node host with HTTPS + managed Postgres.
17. **RESOLVED 24 Nov 2026.** `eth_getCode` at `latest`: EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` is 23689 bytes on mainnet and on Sepolia; v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` is 16035 bytes on both; SelfHumanProofProvider mainnet `0x4b036aFD959B457A208F676cf44Ea3ef73Ea3E3d` and Sepolia `0x5E61c3051Bf4115F90AacEAE6212bc419f8aBB6c` are 686 bytes each. The Sepolia EntryPoint addresses are not added to the testnet table, because §1 lists those contracts for mainnet only. Code at the same addresses on Sepolia is noted here.
18. **RESOLVED 24 Nov 2026.** The caps differ. Mainnet forno accepts `toBlock - fromBlock = 5000` and returns HTTP 400 `query exceeds range, retry smaller (max block range 5000, got 5001)` at 5001. Sepolia forno accepts 100000 and returns `max block range 100000, got 100001` at 100001. `packages/config` stores 5000 and 100000.

## 12. Source index (fetched 24 Nov 2026; copies in `/workspace/preflight-notes/sources/`)
- Hackathon: https://www.loops.house/agents-open-for-business (`hackathon-live.html`, `hackathon-tracks.txt`)
- x402 on Celo: https://x402.celo.org/skill.md · https://x402.celo.org/api/config · https://api.x402.celo.org/supported · https://api.x402.sepolia.celo.org/supported · https://github.com/celo-org/x402-celo-example
- x402 v2 spec: https://github.com/coinbase/x402/tree/main/specs (`x402-specification-v2.md`, `transports-v2/http.md`, `transports-v2/mcp.md`) · `@x402/mcp` README
- Attribution: https://github.com/celo-org/attribution-tags (README, BUILDERS.md, INDEXERS.md, `sdk/src/index.ts`, npm `@celo/attribution-tags@0.5.0`)
- ERC-8004: https://docs.celo.org/build-on-celo/build-with-ai/8004 · https://github.com/erc-8004/erc-8004-contracts `abis/IdentityRegistry.json`
- Self Agent ID: https://docs.self.xyz/docs/agent-id/{overview,quickstart,sdk-integration,rest-api,smart-contracts,erc-8004,registration-modes} · supported countries · live `agent-api.self.xyz/api/agent/info/11142220/5`
- Altana: https://docs.altana.network/llms-full.txt (setup, grantSession, revokeSession, x402 payments, attribution, ERC-8004, Keystore, Networks, Testnet) · https://github.com/altananetwork/altana-sdk (`packages/wallet/src/internal/keystore.ts`, `packages/hypersigner-keystore-mcp/src/keystore.ts`)
- Textile FX: https://docs.textilecredit.com/llms.txt and llms-full.txt (address book, RFQ v2, attribution)
- buy: https://usebuy.ai/llms.txt · Chainstack Celo RPC PAY.md (unpkg `@celo/buy-registry`)
- Prior-edition reference: Assay project page (funding-trace method: "traced to the first non-zero transfer into each payer")
