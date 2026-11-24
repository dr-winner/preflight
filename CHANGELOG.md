# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Gitleaks no longer flags the published Altana contract addresses, or the recorded key id in `live-read.ts`, as generic API keys.

### Changed

- The API loads its chain id, RPC URL, and contract table from `packages/config`.

### Added

- `packages/config` exports the verified Celo mainnet and Sepolia tables and validates `NETWORK=testnet|mainnet`. `CELO_NETWORK=sepolia|mainnet` still selects those tables. The default is testnet.
- `packages/core` reader interfaces and `packages/chain` implementations for ERC-8004, Self, x402 settlement, Altana KeyStore, Textile swaps, and attribution tags. Tests use recorded mainnet and Sepolia fixtures, including Forno's `eth_getLogs` block span.
- `docs/SPEC.md`, the build spec, with the unit 2 resolutions written back into §1 and §11.
- TypeScript pnpm monorepo with a Hono API (`GET /health`), a Next.js landing placeholder, shared types, and an MCP stub.
- Zod config for the API process, a Drizzle client, and local Postgres via Docker Compose.
- GitHub Actions CI: install, typecheck, lint, test, `pnpm audit --prod`, and gitleaks.
- Issue templates, pull request template, and documented labels.
