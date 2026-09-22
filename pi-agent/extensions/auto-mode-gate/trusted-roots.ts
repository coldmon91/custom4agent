/**
 * Directories the fast path treats like the working directory.
 *
 * The working directory alone is too narrow for this setup: the agent's own
 * configuration lives outside whatever repository a session starts in, and
 * scratch work belongs in a temp directory. Those roots are user-declared, in
 * a file the user owns, rather than inferred.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOTS_FILE = "trusted-roots.json";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const rootsPath = join(moduleDir, ROOTS_FILE);

export interface TrustedRoots {
  /** Absolute, `~`-expanded directories. */
  directories: string[];
  /** Anything wrong with the file, for surfacing to the user. */
  problems: string[];
}

let cached: { mtimeMs: number; roots: TrustedRoots } | undefined;

function expand(entry: string): string | undefined {
  const trimmed = entry.trim();
  if (trimmed.length === 0) return undefined;

  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  if (trimmed === "$TMPDIR") return tmpdir();

  return isAbsolute(trimmed) ? resolve(trimmed) : undefined;
}

function readRoots(): TrustedRoots {
  const raw = readFileSync(rootsPath, "utf8");
  const parsed = JSON.parse(raw) as { roots?: unknown };

  if (!Array.isArray(parsed.roots)) {
    return { directories: [], problems: [`${ROOTS_FILE}: "roots" must be an array`] };
  }

  const directories: string[] = [];
  const problems: string[] = [];

  for (const entry of parsed.roots) {
    if (typeof entry !== "string") {
      problems.push(`${ROOTS_FILE}: ignored a non-string entry`);
      continue;
    }

    const expanded = expand(entry);
    if (!expanded) {
      problems.push(`${ROOTS_FILE}: ignored "${entry}" — a root must be an absolute path`);
      continue;
    }

    directories.push(expanded);
  }

  return { directories, problems };
}

/** Re-read when the file changes, so an edit applies without a restart. */
export function getTrustedRoots(): TrustedRoots {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(rootsPath).mtimeMs;
  } catch {
    // Absent by default; the working directory is then the whole fast path.
    return { directories: [], problems: [] };
  }

  if (cached?.mtimeMs === mtimeMs) return cached.roots;

  try {
    const roots = readRoots();
    cached = { mtimeMs, roots };
    return roots;
  } catch (error) {
    const roots: TrustedRoots = {
      directories: [],
      problems: [`${ROOTS_FILE}: ${error instanceof Error ? error.message : String(error)}`],
    };
    cached = { mtimeMs, roots };
    return roots;
  }
}

export function getTrustedRootsPath(): string {
  return rootsPath;
}
