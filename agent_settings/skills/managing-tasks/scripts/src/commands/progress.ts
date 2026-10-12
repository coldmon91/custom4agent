import type { Config } from "../config.ts";
import { replaceProgress, type ProgressSnapshot } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";

/** Replaces `### 진행 상태` with a fresh snapshot dated `options.date`. */
export function updateProgress(
  config: Config, query: string, snapshot: Omit<ProgressSnapshot, "date">, options: CommonOptions,
): Record<string, unknown> {
  const task = openTask(config, query, options);
  replaceProgress(task.doc.lines, { ...snapshot, date: options.date });
  const session = saveTask(task, options);
  return { task: describe(task), session, notices: task.notices };
}
