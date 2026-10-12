import type { Config } from "../config.ts";
import { setScalar } from "../frontmatter.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { parsePriority } from "./create.ts";

export function setPriority(config: Config, query: string, priority: string, options: CommonOptions): Record<string, unknown> {
  const value = parsePriority(priority);
  const task = openTask(config, query, options);
  setScalar(task.doc.lines, "priority", value);
  const session = saveTask(task, options);
  return { task: describe(task), priority: value, session, notices: task.notices };
}
