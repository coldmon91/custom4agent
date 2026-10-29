import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { ensureDir, moveNoOverwrite } from "../file-ops.ts";
import { getList, getScalar, setScalar } from "../frontmatter.ts";
import { openCheckboxes, replaceResult } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { findTask, statusDir, type TaskRef, type TaskStatus } from "../task-store.ts";
import { parseText } from "../text-file.ts";
import { subtaskName } from "./subtask.ts";

export interface MoveInput {
  query: string;
  to: TaskStatus;
  result?: string[];
  allowPending?: boolean;
}

/** Subtask notes not yet done plus unchecked boxes in the task note. */
function pendingItems(ref: TaskRef, lines: string[]): string[] {
  const pending: string[] = [];
  for (const item of getList(lines, "subtask")) {
    const name = subtaskName(item);
    const path = join(ref.entryPath, `${name}.md`);
    const status = existsSync(path) ? getScalar(parseText(readFileSync(path, "utf8")).lines, "status") : "missing";
    if (status !== "done") pending.push(`subtask: ${name} (${status ?? "no status"})`);
  }
  return [...pending, ...openCheckboxes(lines)];
}

/** Dates follow the target state, so any move (including out of archived) leaves them consistent. */
function applyStatusDates(lines: string[], to: TaskStatus, date: string): void {
  if (to === "archived") {
    // Keeps started as is: an archived task may never have begun.
    setScalar(lines, "end-date", date);
    return;
  }
  if (to === "todo") {
    setScalar(lines, "started", "");
    setScalar(lines, "end-date", "");
    return;
  }
  if (!getScalar(lines, "started")) setScalar(lines, "started", date);
  setScalar(lines, "end-date", to === "done" ? date : "");
}

function moveEntry(ref: TaskRef, config: Config, to: TaskStatus): string {
  const targetDir = statusDir(config, ref.year, to);
  ensureDir(targetDir);
  const target = join(targetDir, basename(ref.entryPath));
  moveNoOverwrite(ref.entryPath, target);
  return target;
}

/** Old-format tasks are moved untouched: no frontmatter to update. */
function moveLegacy(config: Config, ref: TaskRef, to: TaskStatus): Record<string, unknown> {
  const target = moveEntry(ref, config, to);
  return {
    task: { name: ref.name, status: to, year: ref.year, path: target, legacy: true },
    from: ref.status,
    notices: ["old-format task moved without edits; offer conversion to the folder + frontmatter format"],
  };
}

export function moveTask(config: Config, input: MoveInput, options: CommonOptions): Record<string, unknown> {
  const located = findTask(config, input.query, options);
  if (located.status === input.to) throw new TaskError("invalid_value", `"${located.name}" is already ${input.to}`);
  if (located.legacy) return moveLegacy(config, located, input.to);

  const task = openTask(config, input.query, options);
  const { ref, doc } = task;
  const from = ref.status;

  if (input.to === "done") {
    const pending = input.allowPending ? [] : pendingItems(ref, doc.lines);
    const resultRequired = !input.result || input.result.length === 0;
    if (pending.length > 0 || resultRequired) {
      throw new TaskError("needs_confirmation", "confirm before completing the task", { pending, resultRequired, path: task.notePath });
    }
  }

  setScalar(doc.lines, "status", input.to);
  applyStatusDates(doc.lines, input.to, options.date);
  if (input.to === "done") replaceResult(doc.lines, input.result!);

  // Move first so a locked folder leaves the note untouched; restore the folder if the write fails.
  const originalEntry = ref.entryPath;
  const movedEntry = moveEntry(ref, config, input.to);
  const relative = task.notePath.slice(originalEntry.length);
  task.notePath = movedEntry + relative;
  ref.entryPath = movedEntry;
  ref.status = input.to;
  try {
    const session = saveTask(task, options);
    return { task: describe(task), from, session, notices: task.notices };
  } catch (error) {
    moveNoOverwrite(movedEntry, originalEntry);
    throw error;
  }
}
