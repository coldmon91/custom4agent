import type { Config } from "../config.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";

/** Records only the current agent session, for actions that change nothing else in the note. */
export function touchSession(config: Config, query: string, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, query, options);
  const session = saveTask(task, options);
  return { task: describe(task), session, notices: task.notices };
}
