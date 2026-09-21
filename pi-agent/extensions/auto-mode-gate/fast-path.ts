/**
 * Decides which tool calls skip the classifier entirely.
 *
 * This mirrors stage 2 of Claude Code's auto-mode ordering: read-only work and
 * file edits inside the working directory are approved without a model call.
 * Everything else — every shell command, every write that escapes the
 * directory — falls through to the classifier.
 */

import { realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import type { PendingAction, TrustBoundary } from "./types.ts";

const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const IN_DIRECTORY_WRITE_TOOLS = new Set(["edit", "write"]);

/**
 * Resolves a path to its real location, following symlinks on the nearest
 * existing ancestor so a link inside the directory cannot smuggle a write out.
 */
function realResolve(path: string, cwd: string): string {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);

  let existing = absolute;
  while (true) {
    try {
      const real = realpathSync(existing);
      return existing === absolute ? real : resolve(real, absolute.slice(existing.length + 1));
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return absolute;
      existing = parent;
    }
  }
}

function isInsideDirectory(path: string, cwd: string): boolean {
  const realCwd = realResolve(cwd, cwd);
  const target = realResolve(path, cwd);
  return target === realCwd || target.startsWith(realCwd + sep);
}

function targetPath(action: PendingAction): string | undefined {
  const path = action.input.path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

/**
 * `true` when the action is safe by construction and needs no classifier call.
 */
export function isAutoApproved(action: PendingAction, boundary: TrustBoundary): boolean {
  if (READ_ONLY_TOOLS.has(action.toolName)) return true;

  if (IN_DIRECTORY_WRITE_TOOLS.has(action.toolName)) {
    const path = targetPath(action);
    // A malformed call has no path to vet, so let the classifier see it.
    return path !== undefined && isInsideDirectory(path, boundary.cwd);
  }

  return false;
}
