// Enumerates and locates tasks: <tasks>/<YYYY>/<status>/<name>/<name>.md (or legacy entries).
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "./config.ts";
import { TaskError } from "./errors.ts";
import { listDirNames, moveNoOverwrite } from "./file-ops.ts";
import { getScalar, hasFrontmatter } from "./frontmatter.ts";
import { containsName, nfc, sameName } from "./names.ts";
import { parseText } from "./text-file.ts";

export const STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof STATUSES)[number];

const YEAR = /^\d{4}$/;
const TASK_ID = /^\d{4}-\d{6}$/;
const OLD_NOTE_NAME = "task.md";

export interface TaskRef {
  name: string;
  year: string;
  status: TaskStatus;
  /** Folder of a folder task, or the file of a single-file task. */
  entryPath: string;
  /** Main note; null for a folder without one. */
  notePath: string | null;
  isFolder: boolean;
  /** Old format without frontmatter: moved as-is, never edited. */
  legacy: boolean;
}

export function isStatus(value: string): value is TaskStatus {
  return (STATUSES as readonly string[]).includes(value);
}

export function statusDir(config: Config, year: string, status: TaskStatus): string {
  return join(config.tasksDir, year, status);
}

function folderNote(folder: string, name: string): string | null {
  const files = listDirNames(folder);
  const own = files.find((file) => sameName(file, `${name}.md`));
  if (own) return join(folder, own);
  const old = files.find((file) => sameName(file, OLD_NOTE_NAME));
  return old ? join(folder, old) : null;
}

function noteHasFrontmatter(path: string | null): boolean {
  return path !== null && hasFrontmatter(parseText(readFileSync(path, "utf8")).lines);
}

function toRef(config: Config, year: string, status: TaskStatus, entry: string): TaskRef | null {
  const entryPath = join(statusDir(config, year, status), entry);
  if (statSync(entryPath).isDirectory()) {
    const name = nfc(entry);
    const notePath = folderNote(entryPath, entry);
    return { name, year, status, entryPath, notePath, isFolder: true, legacy: !noteHasFrontmatter(notePath) };
  }
  if (!entry.toLowerCase().endsWith(".md")) return null;
  const name = nfc(entry.slice(0, -3));
  return { name, year, status, entryPath, notePath: entryPath, isFolder: false, legacy: !noteHasFrontmatter(entryPath) };
}

export function listTasks(config: Config, statuses: readonly TaskStatus[] = STATUSES): TaskRef[] {
  const result: TaskRef[] = [];
  for (const year of listDirNames(config.tasksDir).filter((entry) => YEAR.test(entry)).sort()) {
    for (const status of statuses) {
      for (const entry of listDirNames(statusDir(config, year, status)).sort()) {
        const ref = toRef(config, year, status, entry);
        if (ref) result.push(ref);
      }
    }
  }
  return result;
}

export function readTaskId(ref: TaskRef): string | undefined {
  if (ref.legacy || !ref.notePath) return undefined;
  return getScalar(parseText(readFileSync(ref.notePath, "utf8")).lines, "task-id") || undefined;
}

export interface FindOptions {
  exact?: boolean;
}

/** Picks one task by task-id, exact name, or name substring; anything else is reported with candidates. */
export function findTask(config: Config, query: string, options: FindOptions = {}): TaskRef {
  const all = listTasks(config);
  let matches: TaskRef[];
  if (TASK_ID.test(query)) matches = all.filter((ref) => readTaskId(ref) === query);
  else if (options.exact) matches = all.filter((ref) => sameName(ref.name, query));
  else matches = all.filter((ref) => containsName(ref.name, query));

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    const active = all.filter((ref) => ref.status !== "done");
    throw new TaskError("not_found", `no task matches "${query}"`, { query, candidates: active.map(summarize) });
  }
  throw new TaskError("ambiguous", `${matches.length} tasks match "${query}"`, { query, candidates: matches.map(summarize) });
}

export function summarize(ref: TaskRef): Record<string, unknown> {
  return { name: ref.name, status: ref.status, year: ref.year, taskId: readTaskId(ref) ?? null, legacy: ref.legacy, path: ref.notePath ?? ref.entryPath };
}

/** Renames an old `task.md` note to `<folder>.md`; returns true when it did. */
export function migrateNoteName(ref: TaskRef): boolean {
  if (!ref.isFolder || !ref.notePath || !sameName(basename(ref.notePath), OLD_NOTE_NAME)) return false;
  const target = join(ref.entryPath, `${ref.name}.md`);
  moveNoOverwrite(ref.notePath, target);
  ref.notePath = target;
  return true;
}

export function subtaskPath(ref: TaskRef, subtask: string): string {
  if (!ref.isFolder) throw new TaskError("invalid_value", `"${ref.name}" is a single-file task; subtasks need a task folder`);
  return join(ref.entryPath, `${subtask}.md`);
}
