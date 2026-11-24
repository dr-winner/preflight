# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Manual results such as PayTo registration stay on `summary.manual` and no longer force the track status to `unknown`. `summary.unresolved` is only for reads that failed or could not be observed.
- The probe destroys an upstream body it will not finish reading, and it no longer waits on `dispatcher.close()` after a redirect or an oversized stream. A cross-origin redirect is followed as GET without the POST body or caller headers.
- `POST /v1/preflight/passive` validates its JSON with zod before the x402 middleware. Invalid input is 400 and is not settled. Bodies over 16 KB are rejected.
- Gitleaks no longer flags the published Altana contract addresses, or the recorded key id in `live-read.ts`, as generic API keys.

### Changed

- The API loads its chain id, RPC URL, and contract table from `packages/config`.

### Added

- `POST /v1/preflight/passive` on Celo Sepolia returns HTTP 402 with a v2 `PAYMENT-REQUIRED` challenge and settles through the Celo facilitator. It signs reports with `createEip191ReportSigner` from `packages/checks`.
- `@preflight/probe` performs an SSRF-safe fetch and the X1–X13 and S1–S7 checks.
- `scripts/demo-buyer.ts` pays the passive route with `@x402/fetch`. `render.yaml` is a free-tier deploy sketch.
- `packages/checks` runs G1–G7, G9, T3.1, T3.2, and T4.1–T4.4 as pure functions over the chain readers. Each result is `pass`, `fail`, `warn`, or `unknown` with evidence and one fix hint. A missing or failed read is `unknown`, never `pass`.
- Signed reports use one RFC 8785 canonical form and one EIP-191 signature over `Preflight report v1`, the report id, and the digest. The API calls that signer. `verifyReport` checks the round trip.
- `packages/db` holds the Drizzle schema and SQL migration for the product tables. CI applies it to Postgres. Docker Compose remains the local database.
- `packages/config` exports the verified Celo mainnet and Sepolia tables and validates `NETWORK=testnet|mainnet`. `CELO_NETWORK=sepolia|mainnet` still selects those tables. The default is testnet.
- `packages/core` reader interfaces and `packages/chain` implementations for ERC-8004, Self, x402 settlement, Altana KeyStore, Textile swaps, and attribution tags. Tests use recorded mainnet and Sepolia fixtures, including Forno's `eth_getLogs` block span.
- `docs/SPEC.md`, the build spec, with the unit 2 resolutions written back into §1 and §11.
- TypeScript pnpm monorepo with a Hono API (`GET /health`), a Next.js landing placeholder, shared types, and an MCP stub.
- Zod config for the API process, a Drizzle client, and local Postgres via Docker Compose.
- GitHub Actions CI: install, typecheck, lint, test, `pnpm audit --prod`, and gitleaks.
- Issue templates, pull request template, and documented labels.
