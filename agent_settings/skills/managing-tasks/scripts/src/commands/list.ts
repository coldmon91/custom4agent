import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { getList, getScalar } from "../frontmatter.ts";
import { listTasks, type TaskRef, type TaskStatus } from "../task-store.ts";
import { parseText } from "../text-file.ts";
import { subtaskName } from "./subtask.ts";

function readLines(path: string): string[] {
  return parseText(readFileSync(path, "utf8")).lines;
}

function taskRow(ref: TaskRef): Record<string, unknown> {
  const row: Record<string, unknown> = { name: ref.name, status: ref.status, year: ref.year, legacy: ref.legacy, path: ref.notePath ?? ref.entryPath };
  if (ref.legacy || !ref.notePath) return row;
  const lines = readLines(ref.notePath);
  const subtasks = getList(lines, "subtask").map(subtaskName);
  const done = subtasks.filter((name) => {
    const path = join(ref.entryPath, `${name}.md`);
    return existsSync(path) && getScalar(readLines(path), "status") === "done";
  }).length;
  const field = (key: string) => getScalar(lines, key) || null;
  return {
    ...row,
    taskId: field("task-id"),
    redmine: field("redmine"),
    priority: field("priority"),
    started: field("started"),
    endDate: field("end-date"),
    subtasks: { done, total: subtasks.length },
  };
}

/** Read-only listing; never modifies notes. */
export function listTaskRows(config: Config, statuses: readonly TaskStatus[]): Record<string, unknown> {
  return { tasks: listTasks(config, statuses).map(taskRow) };
}
