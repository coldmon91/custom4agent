import { existsSync } from "node:fs";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { getList } from "../frontmatter.ts";
import { sameName } from "../names.ts";
import { appendCause, appendLog } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { subtaskPath } from "../task-store.ts";
import { readTextFile, writeTextFile } from "../text-file.ts";
import { subtaskName } from "./subtask.ts";

export interface LogInput {
  query: string;
  items: string[];
  causes: string[];
  subtask?: string;
}

/** Writes dated log bullets (and cause bullets) to the task note or one of its subtask notes. */
export function addLog(config: Config, input: LogInput, options: CommonOptions): Record<string, unknown> {
  if (input.items.length === 0 && input.causes.length === 0) {
    throw new TaskError("usage", "log needs at least one --item or --cause");
  }
  const task = openTask(config, input.query, options);
  let target = { path: task.notePath, lines: task.doc.lines };
  let subtaskDoc;
  if (input.subtask !== undefined) {
    const name = getList(task.doc.lines, "subtask").map(subtaskName).find((candidate) => sameName(candidate, input.subtask!));
    if (!name) throw new TaskError("not_found", `no subtask "${input.subtask}" in ${task.ref.name}`);
    const path = subtaskPath(task.ref, name);
    if (!existsSync(path)) throw new TaskError("not_found", `subtask note missing: ${path}`, { path });
    subtaskDoc = readTextFile(path);
    target = { path, lines: subtaskDoc.lines };
  }

  if (input.items.length > 0) appendLog(target.lines, options.date, input.items);
  if (input.causes.length > 0) appendCause(target.lines, input.causes);
  if (subtaskDoc) writeTextFile(target.path, subtaskDoc);
  const session = saveTask(task, options);
  return { task: describe(task), writtenTo: target.path, session, notices: task.notices };
}
