import { existsSync, writeFileSync } from "node:fs";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { notesNamed } from "../file-ops.ts";
import { appendListItem, getList, getScalar, quoteYaml, setScalar } from "../frontmatter.ts";
import { sameName, sanitizeTitle } from "../names.ts";
import { appendLog, setTitleHeading } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { subtaskPath } from "../task-store.ts";
import { loadTemplate, templateCopyState } from "../templates.ts";
import { formatText, readTextFile, writeTextFile } from "../text-file.ts";

/** `[[name]]`, `[[name|alias]]` or plain text → note name. */
export function subtaskName(item: string): string {
  const link = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(item.trim());
  return (link ? link[1] : item).trim();
}

export interface SubtaskAddInput {
  query: string;
  name: string;
  redmine?: number;
}

export function addSubtask(config: Config, input: SubtaskAddInput, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, input.query, options);
  const name = sanitizeTitle(input.name);
  if (sameName(name, task.ref.name)) throw new TaskError("invalid_value", "a subtask cannot have the task's own name", { name });
  const sameNamed = notesNamed(config.vault, name);
  if (sameNamed.length > 0) throw new TaskError("conflict", `a note named "${name}.md" already exists`, { name, existing: sameNamed });
  const path = subtaskPath(task.ref, name);

  const note = loadTemplate("subtask.md");
  setScalar(note.lines, "parent", task.ref.name);
  setScalar(note.lines, "redmine", input.redmine === undefined ? "" : String(input.redmine));
  setTitleHeading(note.lines, name);
  // `wx` refuses to replace a file created since the uniqueness check.
  try {
    writeFileSync(path, formatText(note), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new TaskError("conflict", `already exists: ${path}`, { path });
    throw error;
  }

  appendListItem(task.doc.lines, "subtask", quoteYaml(`[[${name}]]`));
  const session = saveTask(task, options);
  return {
    task: describe(task),
    subtask: { name, path },
    templateCopy: templateCopyState(config, "subtask.md"),
    session,
    notices: task.notices,
  };
}

export interface SubtaskDoneInput {
  query: string;
  name: string;
}

export function completeSubtask(config: Config, input: SubtaskDoneInput, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, input.query, options);
  const listed = getList(task.doc.lines, "subtask").map(subtaskName);
  const name = listed.find((candidate) => sameName(candidate, input.name));
  if (!name) throw new TaskError("not_found", `no subtask "${input.name}" in ${task.ref.name}`, { candidates: listed });
  const path = subtaskPath(task.ref, name);
  if (!existsSync(path)) throw new TaskError("not_found", `subtask note missing: ${path}`, { path });

  const note = readTextFile(path);
  if (getScalar(note.lines, "status") === "done") {
    return { task: describe(task), subtask: { name, path }, changed: false, notices: [...task.notices, "subtask was already done"] };
  }
  setScalar(note.lines, "status", "done");
  writeTextFile(path, note);
  appendLog(task.doc.lines, options.date, [`[[${name}]] 완료`]);
  const session = saveTask(task, options);
  return { task: describe(task), subtask: { name, path }, changed: true, session, notices: task.notices };
}
