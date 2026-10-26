/**
 * Paths a write must never reach without a screen, even inside a trusted root.
 *
 * Each turns a plain file write into running code later, through a command the
 * fast path approves on sight:
 * - a directory on the shell's PATH: a file named `cat` there replaces `cat`.
 *   pi puts its own `bin` directory, inside `~/.pi/agent`, first on that PATH.
 * - a `.git` directory: its config and hooks name programs that `git status`,
 *   `git diff` or `git log` run.
 */

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { realResolve } from "./paths.ts";

let cachedPath: string | undefined;
let cachedDirectories: string[] = [];

/** pi's own `bin`, which it prepends to PATH for every shell it starts. */
function agentBinDirectory(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured
    ? configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : resolve(configured)
    : join(homedir(), ".pi", "agent");
  return join(agentDir, "bin");
}

function commandSearchDirectories(cwd: string): string[] {
  const path = `${agentBinDirectory()}${delimiter}${process.env.PATH ?? ""}`;
  if (path !== cachedPath) {
    cachedPath = path;
    cachedDirectories = path
      .split(delimiter)
      .filter((entry) => isAbsolute(entry))
      .map((entry) => realResolve(entry, cwd));
  }
  return cachedDirectories;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * `true` when a write to `path` could plant code that a screened-away command
 * later runs: the path is in or names a PATH directory or `.git`. With
 * `receivesEntries`, as for a `cp -R x/ path` destination, a directory that
 * contains one is protected too, since the copy could fill it.
 */
export function isProtectedWritePath(path: string, cwd: string, receivesEntries = false): boolean {
  const target = realResolve(path, cwd);
  if (target.split(sep).includes(".git")) return true;

  const searched = commandSearchDirectories(cwd);
  if (searched.includes(target) || searched.includes(dirname(target))) return true;

  if (!receivesEntries || !isDirectory(target)) return false;
  return existsSync(join(target, ".git")) || searched.some((directory) => directory.startsWith(target + sep));
}
