import { fail, pass, unknown, warn } from "../domain.js";
import { HACKATHON_OPENED_AT } from "../constants.js";
import type { GithubReader } from "../extensions.js";
import { parseGithubRepo } from "../github.js";
import type { EntryInput } from "../input.js";

const G4 = "g4.repo.public" as const;
const G5 = "g5.repo.code_window" as const;

const WINDOW_HINT = "state in submission what predates 20 Nov";

function missingRepo(key: typeof G4 | typeof G5, hint: string) {
  return unknown(key, { observed: false, reason: "missing_input" }, hint);
}

export async function checkRepoPublic(input: EntryInput, github: GithubReader) {
  if (input.repoUrl === undefined) {
    return missingRepo(G4, "Add the public GitHub repo URL from registration.");
  }
  const repo = parseGithubRepo(input.repoUrl);
  if (repo === null) {
    return unknown(
      G4,
      { observed: false, reason: "not_observable", repoUrl: input.repoUrl },
      "Use an https://github.com/owner/repo URL. Other hosts are not checked.",
    );
  }
  const lookedUp = await githubRepo(github, repo.owner, repo.repo);
  if (lookedUp.state === "unavailable") {
    return unknown(
      G4,
      {
        observed: false,
        reason: "source_failed",
        message: lookedUp.message,
        repo: `${repo.owner}/${repo.repo}`,
      },
      "Retry the GitHub API. A failed lookup cannot pass.",
    );
  }
  if (lookedUp.state === "missing") {
    return fail(
      G4,
      { observed: false, reason: "absent", repo: `${repo.owner}/${repo.repo}` },
      "The repo URL does not resolve. Register a public GitHub repo that still exists at judging.",
    );
  }
  if (lookedUp.repo.state === "private") {
    return fail(
      G4,
      {
        observed: false,
        reason: "contradicted",
        repo: `${repo.owner}/${repo.repo}`,
        private: true,
      },
      "Make the GitHub repo public. Judges need it to resolve at scoring.",
    );
  }
  return pass(
    G4,
    { observed: true, repo: `${repo.owner}/${repo.repo}`, private: false },
    "Keep this repository public through judging.",
  );
}

export async function checkCodeWindow(input: EntryInput, github: GithubReader) {
  if (input.repoUrl === undefined) {
    return missingRepo(G5, "Add the GitHub repo URL so commits can be dated against 20 Nov 2026.");
  }
  const repo = parseGithubRepo(input.repoUrl);
  if (repo === null) {
    return unknown(
      G5,
      { observed: false, reason: "not_observable", repoUrl: input.repoUrl },
      "Use an https://github.com/owner/repo URL to check the code window.",
    );
  }
  const lookedUp = await githubRepo(github, repo.owner, repo.repo);
  if (lookedUp.state === "unavailable") {
    return unknown(
      G5,
      { observed: false, reason: "source_failed", message: lookedUp.message },
      "Retry the GitHub API before judging the code window.",
    );
  }
  if (lookedUp.state === "missing") {
    return unknown(
      G5,
      { observed: false, reason: "not_observable", repo: `${repo.owner}/${repo.repo}` },
      "The repo does not resolve, so commit dates cannot be checked.",
    );
  }

  let commits: number;
  try {
    commits = await github.commitsBefore(repo.owner, repo.repo, HACKATHON_OPENED_AT);
  } catch (error) {
    const message = error instanceof Error ? error.message : "commit list failed";
    return unknown(
      G5,
      { observed: false, reason: "source_failed", message, repo: `${repo.owner}/${repo.repo}` },
      "Retry the commit list. Author dates are not guessed.",
    );
  }

  const evidence = {
    observed: true as const,
    repo: `${repo.owner}/${repo.repo}`,
    fork: lookedUp.repo.fork,
    createdAt: lookedUp.repo.createdAt,
    commitsBeforeWindow: commits,
    windowOpensAt: HACKATHON_OPENED_AT,
  };
  if (commits > 0 || lookedUp.repo.fork) {
    return warn(G5, evidence, WINDOW_HINT);
  }
  return pass(
    G5,
    evidence,
    "No change needed. The commits we could see start on or after 20 Nov 2026 14:00 GMT.",
  );
}

async function githubRepo(github: GithubReader, owner: string, repo: string) {
  try {
    const result = await github.repo(owner, repo);
    if (result.state === "missing") {
      return { state: "missing" as const };
    }
    return { state: "found" as const, repo: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub request failed";
    return { state: "unavailable" as const, message };
  }
}
