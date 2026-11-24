# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- TypeScript pnpm monorepo with a Hono API (`GET /health`), a Next.js landing placeholder, empty shared types, and an MCP stub.
- Zod config with `CELO_NETWORK=sepolia|mainnet` (default `sepolia`), a Drizzle client, and local Postgres via Docker Compose.
- GitHub Actions CI: install, typecheck, lint, test, `pnpm audit --prod`, and gitleaks.
- Issue templates, pull request template, and documented labels.
