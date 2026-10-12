import { TaskError } from "./errors.ts";

const ISSUE_BASE = "https://projects.rsupport.com/issues/";
const RELATED = /관련:\s*\[?#(\d+)/;
const RECORD = /^\s*-\s*\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})(?: [^\]]+)?\]\s+#(\d+)\s+\S/;

export function parseIssueNumber(value: string): number {
  const match = /^#?(\d+)$/.exec(value.trim());
  if (!match) throw new TaskError("invalid_value", `not a Redmine issue number: ${value}`);
  return Number(match[1]);
}

export function issueUrl(issue: number): string {
  return `${ISSUE_BASE}${issue}`;
}

export function backgroundLink(issue: number): string {
  return `[Redmine #${issue}](${issueUrl(issue)})`;
}

export function relatedItem(issue: number): string {
  return `관련: [#${issue}](${issueUrl(issue)})`;
}

export function relatedIssues(backgroundLines: string[]): number[] {
  return backgroundLines.map((line) => RELATED.exec(line)?.[1]).filter((value) => value !== undefined).map(Number);
}

export function isRedmineRecord(line: string): boolean {
  return RECORD.test(line);
}

/** Latest `[time]` recorded for each issue in `### Redmine`. */
export function latestRecordTimes(records: string[]): Map<number, string> {
  const latest = new Map<number, string>();
  for (const line of records) {
    const match = RECORD.exec(line);
    if (!match) continue;
    const issue = Number(match[2]);
    const previous = latest.get(issue);
    if (previous === undefined || match[1] > previous) latest.set(issue, match[1]);
  }
  return latest;
}
