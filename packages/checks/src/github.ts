import { codeFromRepo } from "@celo/attribution-tags";
import type { EntryInput } from "./input.js";

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

export function parseGithubRepo(repoUrl: string | undefined): GithubRepoRef | null {
  if (repoUrl === undefined || repoUrl.trim() === "") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    return null;
  }
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  const owner = parts[0];
  let repo = parts[1];
  if (owner === undefined || repo === undefined) {
    return null;
  }
  if (repo.endsWith(".git")) {
    repo = repo.slice(0, -4);
  }
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return null;
  }
  return { owner, repo };
}

export type ExpectedCode =
  | { readonly state: "code"; readonly code: string; readonly source: "input" | "repo" }
  | { readonly state: "missing" };

/** User-supplied codes win. `codeFromRepo` is only the fallback. docs/SPEC.md §2 G3 and §11.1. */
export function expectedAttributionCode(input: EntryInput): ExpectedCode {
  if (input.attributionCode !== undefined) {
    return { state: "code", code: input.attributionCode.toLowerCase(), source: "input" };
  }
  const repo = parseGithubRepo(input.repoUrl);
  if (repo === null) {
    return { state: "missing" };
  }
  return {
    state: "code",
    code: codeFromRepo(`${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`),
    source: "repo",
  };
}
