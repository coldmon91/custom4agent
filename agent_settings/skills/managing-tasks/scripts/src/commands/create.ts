import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { ensureDir, notesNamed } from "../file-ops.ts";
import { setScalar, quoteYaml } from "../frontmatter.ts";
import { sanitizeTitle } from "../names.ts";
import { appendBackground, setTitleHeading } from "../note-body.ts";
import { backgroundLink } from "../redmine-refs.ts";
import { assignTaskId } from "../task-id.ts";
import { statusDir } from "../task-store.ts";
import { recordSession, type CommonOptions } from "../task-context.ts";
import { loadTemplate, templateCopyState } from "../templates.ts";
import { writeTextFile } from "../text-file.ts";

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export function parsePriority(value: string): string {
  if ((PRIORITIES as readonly string[]).includes(value)) return value;
  throw new TaskError("invalid_value", `priority must be one of ${PRIORITIES.join(", ")}`, { priority: value });
}

export interface CreateInput {
  title: string;
  redmine?: number;
  priority?: string;
  background?: string[];
  /** Fixed id for the onboarding sample; normally computed. */
  taskId?: string;
}

export function createTask(config: Config, input: CreateInput, options: CommonOptions): Record<string, unknown> {
  const title = sanitizeTitle(input.title);
  const year = options.date.slice(0, 4);
  const todoDir = statusDir(config, year, "todo");
  const folder = join(todoDir, title);
  const notePath = join(folder, `${title}.md`);

  const sameNamed = notesNamed(config.vault, title);
  if (sameNamed.length > 0) throw new TaskError("conflict", `a note named "${title}.md" already exists`, { title, existing: sameNamed });
  ensureDir(todoDir);

  const doc = loadTemplate("task.md");
  setTitleHeading(doc.lines, title);
  setScalar(doc.lines, "redmine", input.redmine === undefined ? "" : String(input.redmine));
  setScalar(doc.lines, "priority", input.priority ?? "");
  const background = [
    ...(input.redmine === undefined ? [] : [backgroundLink(input.redmine)]),
    ...(input.background ?? []),
  ];
  if (background.length > 0) appendBackground(doc.lines, background);
  const session = recordSession(doc.lines, options.agent);

  // mkdir without `recursive` fails if the folder appeared meanwhile, so nothing is overwritten.
  const persist = (taskId: string) => {
    setScalar(doc.lines, "task-id", quoteYaml(taskId));
    try {
      mkdirSync(folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new TaskError("conflict", `already exists: ${folder}`, { folder });
      throw error;
    }
    writeTextFile(notePath, doc);
  };
  let taskId = input.taskId;
  if (taskId) persist(taskId);
  else taskId = assignTaskId(config.tasksDir, year, persist);

  return {
    task: { name: title, status: "todo", year, taskId, path: notePath },
    titleChanged: title !== input.title.trim() ? { from: input.title, to: title } : undefined,
    templateCopy: templateCopyState(config, "task.md"),
    session,
  };
}
