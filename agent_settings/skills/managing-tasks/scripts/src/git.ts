import { execFileSync } from "node:child_process";
import { TaskError } from "./errors.ts";

const GIT_TIMEOUT_MS = 15_000;

function runGit(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new TaskError("git_failed", `git ${args[0]} failed in ${repo}: ${stderr || (error as Error).message}`, { repo });
  }
}

/** `git@host:path.git`, `ssh://git@host:22/path.git`, `https://user@host/path.git` → host + path. */
export function parseRemote(url: string): { host: string; path: string } | null {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const scp = /^[^@/]+@([^:/]+):(?!\/)(.+)$/.exec(trimmed);
  if (scp) return { host: scp[1], path: scp[2] };
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return null;
    return { host: parsed.hostname, path: parsed.pathname.replace(/^\/+/, "") };
  } catch {
    return null;
  }
}

/** Web URL of a commit for GitHub and GitLab hosts; null for anything else. */
export function commitWebUrl(remoteUrl: string, sha: string): string | null {
  const remote = parseRemote(remoteUrl);
  if (!remote) return null;
  const base = `https://${remote.host}/${remote.path}`;
  if (remote.host === "github.com") return `${base}/commit/${sha}`;
  if (remote.host.includes("gitlab")) return `${base}/-/commit/${sha}`;
  return null;
}

export function originUrl(repo: string): string | null {
  try {
    return runGit(repo, ["remote", "get-url", "origin"]) || null;
  } catch {
    return null;
  }
}

export interface CommitInfo {
  sha: string;
  time: number;
  date: string;
  subject: string;
}

function parseCommitLine(line: string): CommitInfo {
  const [sha, time, date, ...subject] = line.split("\t");
  return { sha, time: Number(time), date, subject: subject.join("\t") };
}

const COMMIT_FORMAT = "--format=%h%x09%ct%x09%ad%x09%s";

export function resolveCommit(repo: string, ref: string): CommitInfo {
  if (ref.startsWith("-")) throw new TaskError("invalid_value", `invalid commit: ${ref}`);
  return parseCommitLine(runGit(repo, ["show", "-s", "--date=short", COMMIT_FORMAT, `${ref}^{commit}`]));
}

/** Commits on any branch whose message mentions `#<issue>` (not `#<issue>0`). */
export function commitsMentioningIssue(repo: string, issue: number): CommitInfo[] {
  const output = runGit(repo, ["log", "--all", "-E", `--grep=#${issue}([^0-9]|$)`, "--date=short", COMMIT_FORMAT]);
  return output === "" ? [] : output.split("\n").map(parseCommitLine);
}

/** Commit hash at the end of a recorded item (URL or bare hash). */
export function shaOfItem(item: string): string {
  return item.trim().split("/").pop() ?? "";
}

export function sameCommit(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left.length > 0 && right.length > 0 && (left.startsWith(right) || right.startsWith(left));
}
