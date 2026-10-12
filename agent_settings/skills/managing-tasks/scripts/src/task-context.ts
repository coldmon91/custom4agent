// Shared steps of every command that modifies a task: locate, normalize, then save with the session.
import type { Config } from "./config.ts";
import { TaskError } from "./errors.ts";
import { appendListItem, ensureKey, getList, getScalar, setScalar, quoteYaml } from "./frontmatter.ts";
import { lookupSession, type Agent } from "./session.ts";
import { assignTaskId } from "./task-id.ts";
import { findTask, migrateNoteName, type FindOptions, type TaskRef } from "./task-store.ts";
import { readTextFile, writeTextFile, type TextDoc } from "./text-file.ts";

export interface CommonOptions extends FindOptions {
  agent?: Agent;
  date: string;
}

export interface OpenTask {
  ref: TaskRef;
  notePath: string;
  doc: TextDoc;
  /** Side effects already applied while opening (rename of task.md, task-id assignment). */
  notices: string[];
}

export function openTask(config: Config, query: string, options: CommonOptions): OpenTask {
  const ref = findTask(config, query, options);
  if (ref.legacy || !ref.notePath) {
    throw new TaskError("legacy_task", `"${ref.name}" is an old-format task without frontmatter; convert it first`, { path: ref.entryPath });
  }
  const notices: string[] = [];
  if (migrateNoteName(ref)) notices.push(`renamed task.md to ${ref.name}.md`);
  const notePath = ref.notePath!;
  let doc = readTextFile(notePath);
  if (!getScalar(doc.lines, "task-id")) {
    const taskId = assignTaskId(config.tasksDir, ref.year, (id) => {
      const fresh = readTextFile(notePath);
      setScalar(fresh.lines, "task-id", quoteYaml(id));
      writeTextFile(notePath, fresh);
      doc = fresh;
    });
    notices.push(`assigned task-id ${taskId}`);
  }
  return { ref, notePath, doc, notices };
}

export type SessionResult = { recorded: string } | { alreadyRecorded: string } | { skipped: string };

/** Adds the current agent session to `agent-session` unless it is already listed. */
export function recordSession(lines: string[], agent: Agent | undefined): SessionResult {
  const lookup = lookupSession(agent);
  if ("skipped" in lookup) return lookup;
  ensureKey(lines, "agent-session");
  if (getList(lines, "agent-session").includes(lookup.command)) return { alreadyRecorded: lookup.command };
  appendListItem(lines, "agent-session", lookup.command);
  return { recorded: lookup.command };
}

export function saveTask(task: OpenTask, options: CommonOptions): SessionResult {
  const session = recordSession(task.doc.lines, options.agent);
  writeTextFile(task.notePath, task.doc);
  return session;
}

export function describe(task: OpenTask): Record<string, unknown> {
  return {
    name: task.ref.name,
    status: task.ref.status,
    year: task.ref.year,
    taskId: getScalar(task.doc.lines, "task-id") ?? null,
    path: task.notePath,
  };
}
