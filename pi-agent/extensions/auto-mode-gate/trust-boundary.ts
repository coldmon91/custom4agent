/**
 * Captures what counts as the user's own infrastructure.
 *
 * The snapshot is taken once at session start. A remote added or repointed
 * later in the session is therefore never inside the boundary, which is what
 * stops `git remote add <attacker>` from laundering a push into a trusted one.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TrustBoundary } from "./types.ts";

const GIT_REMOTE_TIMEOUT_MS = 5_000;

/** Pulls the URL column out of `git remote -v` output. */
function parseRemoteUrls(stdout: string): string[] {
  const urls = stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((url): url is string => Boolean(url));

  return [...new Set(urls)];
}

export async function captureTrustBoundary(
  pi: ExtensionAPI,
  cwd: string,
): Promise<TrustBoundary> {
  try {
    const result = await pi.exec("git", ["remote", "-v"], {
      cwd,
      timeout: GIT_REMOTE_TIMEOUT_MS,
    });

    if (result.code !== 0) return { cwd, remoteUrls: [] };

    return { cwd, remoteUrls: parseRemoteUrls(result.stdout) };
  } catch {
    // Not a git checkout, or git is unavailable. The directory alone is then
    // the whole boundary, which is the stricter reading.
    return { cwd, remoteUrls: [] };
  }
}
