# Contributing

## Workflow

One issue, one branch, one pull request.

1. Open an issue with the feature or bug template.
2. Branch from `main`. Use a lowercase name tied to that issue, such as `feat/12-health-check`.
3. Open one pull request that closes that issue.
4. Fill in **How I verified** on the pull request.

Keep unrelated changes off the branch.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```text
<type>(<optional scope>): <imperative summary>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.

Examples:

```text
feat(api): add the health route
fix(api): reject an unknown CELO_NETWORK
docs: describe local Postgres
```

The subject is imperative and has no trailing period.

## Checks

Before you ask for review:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## Changelog

User-visible changes get an entry under `## [Unreleased]` in `CHANGELOG.md`, following Keep a Changelog.

## Labels

Repository labels are listed in [`.github/labels.yml`](.github/labels.yml). Maintainers keep GitHub's labels in sync with that file.

| Label              | Use                                   |
| ------------------ | ------------------------------------- |
| `bug`              | Something is broken                   |
| `enhancement`      | A new capability or improvement       |
| `documentation`    | Docs only                             |
| `good first issue` | Small and well specified              |
| `area: api`        | `apps/api`                            |
| `area: web`        | `apps/web`                            |
| `area: core`       | `packages/core`                       |
| `area: mcp`        | `packages/mcp`                        |
| `area: db`         | Drizzle, Postgres, and migrations     |
| `area: ci`         | GitHub Actions and repository tooling |
| `priority: high`   | Blocks the hackathon path             |
| `priority: normal` | Default priority                      |
