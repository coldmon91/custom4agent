import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { ensureDir, moveNoOverwrite } from "../file-ops.ts";
import { getList, getScalar, setScalar } from "../frontmatter.ts";
import { openCheckboxes, replaceResult } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { findTask, statusDir, STATUSES, type TaskRef, type TaskStatus } from "../task-store.ts";
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
  const forward = STATUSES.indexOf(input.to) > STATUSES.indexOf(from);

  if (input.to === "done") {
    const pending = input.allowPending ? [] : pendingItems(ref, doc.lines);
    const resultRequired = !input.result || input.result.length === 0;
    if (pending.length > 0 || resultRequired) {
      throw new TaskError("needs_confirmation", "confirm before completing the task", { pending, resultRequired, path: task.notePath });
    }
  }

  setScalar(doc.lines, "status", input.to);
  if (forward) {
    if (!getScalar(doc.lines, "started")) setScalar(doc.lines, "started", options.date);
    if (input.to === "done") {
      setScalar(doc.lines, "end-date", options.date);
      replaceResult(doc.lines, input.result!);
    }
  } else {
    // Moving back undoes the dates the later state filled in.
    setScalar(doc.lines, "end-date", "");
    if (input.to === "todo") setScalar(doc.lines, "started", "");
  }

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
