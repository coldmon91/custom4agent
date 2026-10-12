import { existsSync } from "node:fs";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { getList, getScalar, setScalar } from "../frontmatter.ts";
import { appendBackground, backgroundLines, insertRedmineRecord, redmineRecords } from "../note-body.ts";
import { isRedmineRecord, latestRecordTimes, relatedIssues, relatedItem } from "../redmine-refs.ts";
import { describe, openTask, saveTask, type CommonOptions, type OpenTask } from "../task-context.ts";
import { subtaskPath } from "../task-store.ts";
import { readTextFile } from "../text-file.ts";
import { subtaskName } from "./subtask.ts";

export interface IssueRef {
  issue: number;
  source: string; // "redmine", "related" or "subtask:<name>"
}

/** Every Redmine issue the task refers to: main field, `관련:` lines, subtask notes. */
export function taskIssues(task: OpenTask): IssueRef[] {
  const result: IssueRef[] = [];
  const main = getScalar(task.doc.lines, "redmine");
  if (main) result.push({ issue: Number(main), source: "redmine" });
  for (const issue of relatedIssues(backgroundLines(task.doc.lines))) result.push({ issue, source: "related" });
  for (const name of getList(task.doc.lines, "subtask").map(subtaskName)) {
    const path = subtaskPath(task.ref, name);
    if (!existsSync(path)) continue;
    const value = getScalar(readTextFile(path).lines, "redmine");
    if (value) result.push({ issue: Number(value), source: `subtask:${name}` });
  }
  return result.filter((entry) => Number.isInteger(entry.issue) && entry.issue > 0);
}

/** Empty `redmine` takes the issue; otherwise it becomes a `관련:` line. Known issues are skipped. */
export function addIssue(config: Config, query: string, issue: number, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, query, options);
  const known = taskIssues(task).filter((entry) => !entry.source.startsWith("subtask:"));
  if (known.some((entry) => entry.issue === issue)) {
    return { task: describe(task), issue, placement: "already-present", notices: task.notices };
  }
  let placement: "redmine" | "related";
  if (!getScalar(task.doc.lines, "redmine")) {
    setScalar(task.doc.lines, "redmine", String(issue));
    placement = "redmine";
  } else {
    appendBackground(task.doc.lines, [relatedItem(issue)]);
    placement = "related";
  }
  const session = saveTask(task, options);
  return { task: describe(task), issue, placement, session, notices: task.notices };
}

/** Issues with the latest `### Redmine` time each, the baseline for the next Redmine check. */
export function listIssues(config: Config, query: string, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, query, options);
  const latest = latestRecordTimes(redmineRecords(task.doc.lines));
  const issues = taskIssues(task).map((entry) => ({ ...entry, lastRecorded: latest.get(entry.issue) ?? null }));
  return { task: describe(task), issues, notices: task.notices };
}

/** Bullet form of a record; the leading `- ` is optional on input since CLI values cannot start with `-`. */
function toRecordLine(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("- ") ? trimmed : `- ${trimmed}`;
}

export function recordIssueUpdates(config: Config, query: string, rawRecords: string[], options: CommonOptions): Record<string, unknown> {
  const records = rawRecords.map(toRecordLine);
  const invalid = records.filter((line) => !isRedmineRecord(line));
  if (records.length === 0 || invalid.length > 0) {
    throw new TaskError("invalid_value", "each --line must look like `[YYYY-MM-DD HH:MM author] #123 summary`", { invalid });
  }
  const task = openTask(config, query, options);
  const existing = new Set(redmineRecords(task.doc.lines).map((line) => line.trim()));
  const added = records.filter((line) => !existing.has(line));
  for (const line of added) insertRedmineRecord(task.doc.lines, line);
  const session = saveTask(task, options);
  return { task: describe(task), added, duplicates: records.length - added.length, session, notices: task.notices };
}
