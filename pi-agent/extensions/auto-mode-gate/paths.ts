/**
 * Path resolution shared by the fast path and the shell screener.
 *
 * Every containment check goes through `realResolve` so a symlink inside a
 * trusted root cannot smuggle a write out of it.
 */

import { realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";

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
