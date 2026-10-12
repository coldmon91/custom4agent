import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { appendListItem, getList } from "../frontmatter.ts";
import { commitsMentioningIssue, commitWebUrl, originUrl, resolveCommit, sameCommit, shaOfItem, type CommitInfo } from "../git.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { taskIssues } from "./redmine.ts";

const URL_PREFIX = /^https?:\/\//;

interface PendingItem {
  item: string;
  sha: string;
  time: number;
}

function toItem(repo: string, ref: string, remote: string | null): PendingItem {
  if (URL_PREFIX.test(ref)) return { item: ref, sha: shaOfItem(ref), time: Number.POSITIVE_INFINITY };
  const commit = resolveCommit(repo, ref);
  return { item: (remote && commitWebUrl(remote, commit.sha)) ?? commit.sha, sha: commit.sha, time: commit.time };
}

/** Records commits as web URLs (or bare hashes when the host is unknown), oldest first, skipping duplicates. */
export function addCommits(config: Config, query: string, refs: string[], repo: string, options: CommonOptions): Record<string, unknown> {
  if (refs.length === 0) throw new TaskError("usage", "commit add needs at least one commit hash or URL");
  const task = openTask(config, query, options);
  const recorded = getList(task.doc.lines, "git-commit").map(shaOfItem);
  const remote = originUrl(repo);

  const added: string[] = [];
  const skipped: string[] = [];
  const items = refs.map((ref) => toItem(repo, ref, remote)).sort((a, b) => a.time - b.time);
  for (const pending of items) {
    if ([...recorded, ...added.map(shaOfItem)].some((sha) => sameCommit(sha, pending.sha))) {
      skipped.push(pending.item);
      continue;
    }
    appendListItem(task.doc.lines, "git-commit", pending.item);
    added.push(pending.item);
  }
  const session = saveTask(task, options);
  return { task: describe(task), added, skipped, session, notices: task.notices };
}

/** Commits mentioning the task's Redmine issues that are not recorded yet; read-only. */
export function searchCommits(config: Config, query: string, repo: string, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, query, options);
  const recorded = getList(task.doc.lines, "git-commit").map(shaOfItem);
  const issues = taskIssues(task).map((entry) => entry.issue);
  const candidates: (CommitInfo & { issue: number })[] = [];
  for (const issue of [...new Set(issues)]) {
    for (const commit of commitsMentioningIssue(repo, issue)) {
      const known = recorded.some((sha) => sameCommit(sha, commit.sha)) || candidates.some((c) => c.sha === commit.sha);
      if (!known) candidates.push({ ...commit, issue });
    }
  }
  candidates.sort((a, b) => a.time - b.time);
  return { task: describe(task), issues, candidates, notices: task.notices };
}
