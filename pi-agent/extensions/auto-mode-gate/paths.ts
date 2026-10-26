/**
 * Path resolution shared by the fast path and the shell screener.
 *
 * Every containment check goes through `realResolve` so a symlink inside a
 * trusted root cannot smuggle a write out of it.
 */

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[  -   　]/g;

/**
 * The absolute path pi's `edit` and `write` tools will touch for a `path`
 * argument. They strip a leading `@`, expand `~`, and accept `file://` URLs, so
 * checking the raw string would miss where the write really lands.
 * `undefined` when the tool itself could not resolve it.
 */
export function resolveToolPath(path: string, cwd: string): string | undefined {
  let normalized = path.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);

  if (normalized === "~") return homedir();
  if (normalized.startsWith("~/")) return join(homedir(), normalized.slice(2));

  if (normalized.startsWith("file://")) {
    try {
      normalized = fileURLToPath(normalized);
    } catch {
      return undefined;
    }
  }

  return isAbsolute(normalized) ? resolve(normalized) : resolve(cwd, normalized);
}

/**
 * Resolves a path to its real location, following symlinks on the nearest
 * existing ancestor so a link to a not-yet-created file still resolves.
 */
export function realResolve(path: string, cwd: string): string {
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

export function isInsideDirectory(path: string, directory: string, cwd: string): boolean {
  const root = realResolve(directory, cwd);
  const target = realResolve(path, cwd);
  return target === root || target.startsWith(root + sep);
}

/** `true` when the path lands inside any of the roots. */
export function isInsideAnyRoot(path: string, roots: readonly string[], cwd: string): boolean {
  return roots.some((root) => isInsideDirectory(path, root, cwd));
}
