import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { TaskError } from "./errors.ts";
import { nfc, sameName } from "./names.ts";

// Windows reports these while another process (Obsidian, sync, antivirus) holds a handle.
const TRANSIENT_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 200;

export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(source: string, target: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT_CODES.has(code)) throw error;
      if (attempt >= RENAME_ATTEMPTS) {
        throw new TaskError("locked", `cannot move ${source}: ${code} (file may be open in another program)`, { source, target });
      }
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

/**
 * Renames without ever replacing an existing entry. A case-only rename goes through a
 * temporary name because case-insensitive file systems report the target as existing.
 */
export function moveNoOverwrite(source: string, target: string): void {
  if (!existsSync(source)) throw new TaskError("not_found", `not found: ${source}`, { source });
  const caseOnly = nfc(source) !== nfc(target) && sameName(source, target);
  if (existsSync(target) && !caseOnly) throw new TaskError("conflict", `already exists: ${target}`, { target });
  if (caseOnly) {
    const temporary = `${source}.renaming-${process.pid}`;
    renameWithRetry(source, temporary);
    renameWithRetry(temporary, target);
    return;
  }
  renameWithRetry(source, target);
}

export function ensureDir(path: string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(path, { recursive: true });
  return true;
}

/** Recursively yields file paths, skipping dot entries (.obsidian, .trash, .DS_Store). */
export function* walkFiles(dir: string, accept: (name: string) => boolean): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path, accept);
    else if (entry.isFile() && accept(entry.name)) yield path;
  }
}

export function markdownFiles(dir: string): Generator<string> {
  return walkFiles(dir, (name) => name.toLowerCase().endsWith(".md"));
}

/** Notes anywhere in the vault named `<name>.md`, compared the way case-insensitive file systems do. */
export function notesNamed(vault: string, name: string): string[] {
  const fileName = `${name}.md`;
  return [...walkFiles(vault, (entry) => sameName(entry, fileName))];
}

export function listDirNames(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
}
