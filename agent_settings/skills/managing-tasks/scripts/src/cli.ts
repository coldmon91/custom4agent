import { parseArgs } from "node:util";
import { loadConfig, type Config } from "./config.ts";
import { parseDateOption } from "./dates.ts";
import { TaskError } from "./errors.ts";
import { parseIssueNumber } from "./redmine-refs.ts";
import { parseAgent } from "./session.ts";
import type { CommonOptions } from "./task-context.ts";
import { isStatus, STATUSES, type TaskStatus } from "./task-store.ts";
import { addCommits, searchCommits } from "./commands/commit.ts";
import { createTask, parsePriority } from "./commands/create.ts";
import { initVault } from "./commands/init.ts";
import { listTaskRows } from "./commands/list.ts";
import { addLog } from "./commands/log.ts";
import { moveTask } from "./commands/move.ts";
import { setPriority } from "./commands/priority.ts";
import { updateProgress } from "./commands/progress.ts";
import { touchSession } from "./commands/record-session.ts";
import { addIssue, listIssues, recordIssueUpdates } from "./commands/redmine.ts";
import { renameTask } from "./commands/rename.ts";
import { addSubtask, completeSubtask } from "./commands/subtask.ts";
import { editTags } from "./commands/tag.ts";
import { findTask, summarize } from "./task-store.ts";

const USAGE = `node tasks.mjs <command> [args] [options]   (all output is JSON)

  config                                   show settings and resolved paths
  init [--vault P] [--tasks D] [--templates D]   onboarding: settings, folders, templates, base, sample
  list [--status todo,in_progress|all]     tasks with fields and subtask progress
  find <task>                              resolve a task (name substring, --exact name, or task-id)
  create --title T [--redmine N] [--priority P]
  move <task> <todo|in_progress|done> [--result L]... [--allow-pending]
  rename <task> --to T
  log <task> [--item L]... [--cause L]... [--subtask S]
  progress <task> --current L [--remaining L] [--blocked L]
  subtask add <task> <name> [--redmine N]
  subtask done <task> <name>
  commit add <task> <hash|url>... [--repo DIR]
  commit search <task> [--repo DIR]
  redmine add <task> <N>
  redmine list <task>
  redmine record <task> --line L...
  priority <task> <low|medium|high|critical>
  tag <task> [--add T]... [--remove T]...
  session <task>                           record only the current agent session

common: --agent claude|codex|pi|opencode   --date YYYY-MM-DD   --exact
values starting with "-" need the --option=value form`;

const OPTIONS = {
  agent: { type: "string" }, date: { type: "string" }, exact: { type: "boolean" },
  vault: { type: "string" }, tasks: { type: "string" }, templates: { type: "string" },
  status: { type: "string" }, title: { type: "string" }, redmine: { type: "string" }, priority: { type: "string" },
  result: { type: "string", multiple: true }, "allow-pending": { type: "boolean" }, to: { type: "string" },
  item: { type: "string", multiple: true }, cause: { type: "string", multiple: true }, subtask: { type: "string" },
  current: { type: "string" }, remaining: { type: "string" }, blocked: { type: "string" },
  add: { type: "string", multiple: true }, remove: { type: "string", multiple: true },
  repo: { type: "string" }, line: { type: "string", multiple: true }, help: { type: "boolean", short: "h" },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>["values"];

function need(value: string | undefined, what: string): string {
  if (value === undefined || value.trim() === "") throw new TaskError("usage", `missing ${what}\n\n${USAGE}`);
  return value;
}

function parseStatuses(value: string | undefined): TaskStatus[] {
  if (value === undefined) return ["todo", "in_progress"];
  if (value === "all") return [...STATUSES];
  const statuses = value.split(",").map((item) => item.trim());
  const invalid = statuses.filter((item) => !isStatus(item));
  if (invalid.length > 0) throw new TaskError("invalid_value", `unknown status: ${invalid.join(", ")}`);
  return statuses as TaskStatus[];
}

function run(args: string[]): Record<string, unknown> {
  const { values, positionals } = parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  const [command, ...rest] = positionals;
  if (values.help || command === undefined || command === "help") return { usage: USAGE };

  const options: CommonOptions = {
    agent: values.agent === undefined ? undefined : parseAgent(values.agent),
    date: parseDateOption(values.date),
    exact: values.exact,
  };
  if (command === "init") return initVault({ vault: values.vault, tasks: values.tasks, templates: values.templates }, options);
  if (command === "config") return { config: loadConfig() };

  const config = loadConfig();
  const task = () => need(rest[0], "<task>");
  switch (command) {
    case "list":
      return listTaskRows(config, parseStatuses(values.status));
    case "find":
      return { task: summarize(findTask(config, task(), options)) };
    case "create":
      return createTask(config, {
        title: need(values.title, "--title"),
        redmine: values.redmine === undefined ? undefined : parseIssueNumber(values.redmine),
        priority: values.priority === undefined ? undefined : parsePriority(values.priority),
      }, options);
    case "move": {
      const to = need(rest[1], "<status>");
      if (!isStatus(to)) throw new TaskError("invalid_value", `status must be one of ${STATUSES.join(", ")}`);
      return moveTask(config, { query: task(), to, result: values.result, allowPending: values["allow-pending"] }, options);
    }
    case "rename":
      return renameTask(config, task(), need(values.to, "--to"), options);
    case "log":
      return addLog(config, { query: task(), items: values.item ?? [], causes: values.cause ?? [], subtask: values.subtask }, options);
    case "progress":
      return updateProgress(config, task(), {
        current: need(values.current, "--current"),
        remaining: values.remaining ?? "없음",
        blocked: values.blocked ?? "없음",
      }, options);
    case "priority":
      return setPriority(config, task(), need(rest[1], "<priority>"), options);
    case "tag":
      return editTags(config, { query: task(), add: values.add ?? [], remove: values.remove ?? [] }, options);
    case "session":
      return touchSession(config, task(), options);
    default:
      return runGroup(command, rest, values, options, config);
  }
}

/** Two-word commands: `subtask`, `commit`, `redmine`. */
function runGroup(
  group: string, rest: string[], values: Values, options: CommonOptions, config: Config,
): Record<string, unknown> {
  const [action, query, ...more] = rest;
  const target = () => need(query, "<task>");
  const repo = values.repo ?? process.cwd();
  switch (`${group} ${action}`) {
    case "subtask add":
      return addSubtask(config, {
        query: target(), name: need(more[0], "<name>"),
        redmine: values.redmine === undefined ? undefined : parseIssueNumber(values.redmine),
      }, options);
    case "subtask done":
      return completeSubtask(config, { query: target(), name: need(more[0], "<name>") }, options);
    case "commit add":
      return addCommits(config, target(), more, repo, options);
    case "commit search":
      return searchCommits(config, target(), repo, options);
    case "redmine add":
      return addIssue(config, target(), parseIssueNumber(need(more[0], "<N>")), options);
    case "redmine list":
      return listIssues(config, target(), options);
    case "redmine record":
      return recordIssueUpdates(config, target(), values.line ?? [], options);
    default:
      throw new TaskError("usage", `unknown command: ${[group, action].filter(Boolean).join(" ")}\n\n${USAGE}`);
  }
}

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof TaskError) return { code: error.code, message: error.message, ...error.details };
  const code = (error as { code?: string }).code;
  if (typeof code === "string" && code.startsWith("ERR_PARSE_ARGS")) {
    return { code: "usage", message: `${(error as Error).message}\n\n${USAGE}` };
  }
  return { code: "internal", message: (error as Error).stack ?? String(error) };
}

/** Prints one JSON object; exit code 0 on success, 2 for usage errors, 1 otherwise. */
export function main(args: string[]): number {
  try {
    const result = run(args);
    process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + "\n");
    return 0;
  } catch (error) {
    const payload = errorPayload(error);
    process.stdout.write(JSON.stringify({ ok: false, error: payload }, null, 2) + "\n");
    return payload.code === "usage" ? 2 : 1;
  }
}
