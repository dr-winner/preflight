# Preflight

Preflight is a paid x402 API, plus an MCP tool, for agents entering the Celo hackathon Agents Open for Business. An agent calls Preflight to learn whether an entry meets each track's must-haves. The response is a signed per-track pass or fail report with fix hints.

Self Agent ID gates the deep checks: one free check per verified human, then a per-human quota shared across that human's agents. Preflight's own agent pays for upstream data with an Altana session key that has a spend cap and an allowlist.

The checks Preflight will run:

- ERC-8004 registration
- Self Agent ID proof
- Attribution tag on transaction calldata
- x402 settlement
- Altana session-key grant and revoke
- Textile FX corridor conversion
- Independent-user funding graph
- A lint and a safe passive security check of the entry's x402 endpoint

This repository is the foundation. The API serves a health check. The landing page is a placeholder. The MCP package is a stub. Track checks are not implemented yet.

Network selection is real: `CELO_NETWORK=sepolia` (the default) or `CELO_NETWORK=mainnet`. Development targets Celo Sepolia. Mainnet is a config switch for later.

## Quickstart

Requirements: Node.js 22, pnpm 10, and Docker when you want local Postgres.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter api dev
```

Health check:

```bash
curl -sS http://127.0.0.1:3001/health
```

```json
{ "ok": true }
```

`/health` does not need a database or a filled-in environment. Empty values fall back to defaults: `CELO_NETWORK=sepolia`, port `3001`, and `NODE_ENV=development`.

Copy the variable names when you are ready to set them:

```bash
cp .env.example .env
```

`.env.example` lists names only. Put values in `.env`, which is gitignored.

Start Postgres. The compose file uses local defaults `preflight` / `preflight` and database `preflight`:

```bash
docker compose up -d
```

Set `DATABASE_URL` to `postgresql://preflight:preflight@localhost:5432/preflight`. The Drizzle client connects when a caller uses `createDb`. No route uses it yet.

Landing placeholder:

```bash
pnpm --filter web dev
```

Open http://127.0.0.1:3000.

`next dev` rewrites `apps/web/next-env.d.ts` so it points at `.next/dev/types`. Leave that rewrite out of commits. `pnpm typecheck` restores the committed path.

## Scripts

- `pnpm typecheck` runs `tsc --noEmit` in every package.
- `pnpm lint` runs ESLint and Prettier.
- `pnpm test` runs Vitest.
- `pnpm --filter api dev` serves the API, including `GET /health`.
- `pnpm --filter web dev` serves the landing placeholder.
- `pnpm format` writes Prettier formatting.
- `pnpm audit:prod` runs `pnpm audit --prod`.

## Architecture

```text
apps/api        Hono on Node 22. Health route, zod config, Drizzle client.
apps/web        Next.js landing placeholder.
packages/core   Shared types. Empty until checks exist.
packages/mcp    MCP server stub. No tool registered yet.
docker-compose  Local Postgres 17.
```

```mermaid
flowchart LR
  agent[Caller]
  web[apps/web]
  api[apps/api]
  mcp[packages/mcp]
  cfg[zod config]
  db[Drizzle client]
  pg[(Postgres)]

  agent --> api
  agent -.-> mcp
  web -.-> agent
  api --> cfg
  api --> db
  db -.-> pg
```

Solid lines are wired. Dashed lines are not live yet.

`loadConfig` in `apps/api/src/config.ts` reads `NODE_ENV`, `PORT`, `DATABASE_URL`, and `CELO_NETWORK`. Invalid values throw before the server listens. `CELO_NETWORK` accepts `sepolia` or `mainnet` and defaults to `sepolia`.

## CI

Pull requests and pushes to `main` install dependencies, typecheck, lint, test, run `pnpm audit --prod`, and scan for secrets with gitleaks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are tracked in [CHANGELOG.md](CHANGELOG.md). License: [MIT](LICENSE).
