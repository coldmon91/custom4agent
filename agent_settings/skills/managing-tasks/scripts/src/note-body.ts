// Task-note specific body edits. Section names and order follow references/task.md.
import {
  afterLastContent, findHeading, headings, removeEmptyBullets,
  replaceSectionContent, sectionEnd,
} from "./markdown-sections.ts";

export const SECTION = {
  background: "배경",
  log: "작업 로그",
  result: "결과",
} as const;

/** Fixed `###` subsections that follow the dated log entries, in order. */
export const LOG_SUBSECTION = {
  cause: "원인 분석",
  progress: "진행 상태",
  redmine: "Redmine",
} as const;
const LOG_SUBSECTION_ORDER: readonly string[] = Object.values(LOG_SUBSECTION);

const DATE_TITLE = /^\d{4}-\d{2}-\d{2}$/;
const REDMINE_LINE_TIME = /^\s*-\s*\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/;

export function setTitleHeading(lines: string[], title: string): void {
  const heading = headings(lines).find((candidate) => candidate.level === 1);
  if (!heading) throw new Error("note has no `# ` heading");
  lines[heading.index] = `# ${title}`;
}

/** Index of a `##` section, created before `## 결과` (or at the end) when missing. */
function ensureSection(lines: string[], title: string): number {
  const existing = findHeading(lines, 2, title);
  if (existing) return existing.index;
  const result = title === SECTION.result ? undefined : findHeading(lines, 2, SECTION.result);
  const position = result ? afterLastContent(lines, 0, result.index) : afterLastContent(lines, 0, lines.length);
  lines.splice(position, 0, `## ${title}`);
  return position;
}

function ensureLogSubsection(lines: string[], title: string): number {
  const log = ensureSection(lines, SECTION.log);
  const logEnd = sectionEnd(lines, log);
  const existing = findHeading(lines, 3, title, log, logEnd);
  if (existing) return existing.index;
  const rank = LOG_SUBSECTION_ORDER.indexOf(title);
  const later = headings(lines).find(
    (heading) => heading.level === 3 && heading.index > log && heading.index < logEnd
      && LOG_SUBSECTION_ORDER.indexOf(heading.title) > rank,
  );
  const position = afterLastContent(lines, log, later ? later.index : logEnd);
  lines.splice(position, 0, `### ${title}`);
  return position;
}

/** Appends bullets to the end of the section's content, replacing placeholder bullets. */
function appendToSection(lines: string[], headingIndex: number, bullets: string[]): void {
  removeEmptyBullets(lines, headingIndex + 1, sectionEnd(lines, headingIndex));
  const position = afterLastContent(lines, headingIndex, sectionEnd(lines, headingIndex));
  lines.splice(position, 0, ...bullets);
}

function toBullets(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

/** Adds bullets under `### <date>` in `## 작업 로그`, keeping dated headings before the fixed subsections. */
export function appendLog(lines: string[], date: string, items: string[]): void {
  const log = ensureSection(lines, SECTION.log);
  const firstSub = headings(lines).find((heading) => heading.index > log && heading.level >= 3);
  const preambleEnd = firstSub && firstSub.index < sectionEnd(lines, log) ? firstSub.index : sectionEnd(lines, log);
  removeEmptyBullets(lines, log + 1, preambleEnd);

  const logEnd = sectionEnd(lines, log);
  const existing = findHeading(lines, 3, date, log, logEnd);
  if (existing) {
    appendToSection(lines, existing.index, toBullets(items));
    return;
  }
  const next = headings(lines).find(
    (heading) => heading.level === 3 && heading.index > log && heading.index < logEnd
      && (!DATE_TITLE.test(heading.title) || heading.title > date),
  );
  const position = afterLastContent(lines, log, next ? next.index : logEnd);
  lines.splice(position, 0, `### ${date}`, ...toBullets(items));
}

export function appendCause(lines: string[], items: string[]): void {
  appendToSection(lines, ensureLogSubsection(lines, LOG_SUBSECTION.cause), toBullets(items));
}

export interface ProgressSnapshot {
  current: string;
  remaining: string;
  blocked: string;
  date: string;
}

export function replaceProgress(lines: string[], snapshot: ProgressSnapshot): void {
  const index = ensureLogSubsection(lines, LOG_SUBSECTION.progress);
  replaceSectionContent(lines, index, [
    `- 현재: ${snapshot.current}`,
    `- 남은 일: ${snapshot.remaining}`,
    `- 막힘: ${snapshot.blocked}`,
    `- 갱신: ${snapshot.date}`,
  ]);
}

/** Inserts a `### Redmine` record line keeping the section in ascending time order. */
export function insertRedmineRecord(lines: string[], record: string): void {
  const index = ensureLogSubsection(lines, LOG_SUBSECTION.redmine);
  const end = sectionEnd(lines, index);
  removeEmptyBullets(lines, index + 1, end);
  const time = REDMINE_LINE_TIME.exec(record)?.[1] ?? "";
  const contentEnd = afterLastContent(lines, index, sectionEnd(lines, index));
  let position = contentEnd;
  for (let i = index + 1; i < contentEnd; i++) {
    const existingTime = REDMINE_LINE_TIME.exec(lines[i])?.[1];
    if (existingTime !== undefined && existingTime > time) {
      position = i;
      break;
    }
  }
  lines.splice(position, 0, record);
}

/** Lines of `### Redmine`, used to find the latest recorded time per issue. */
export function redmineRecords(lines: string[]): string[] {
  const log = findHeading(lines, 2, SECTION.log);
  if (!log) return [];
  const heading = findHeading(lines, 3, LOG_SUBSECTION.redmine, log.index, sectionEnd(lines, log.index));
  if (!heading) return [];
  return lines.slice(heading.index + 1, sectionEnd(lines, heading.index)).filter((line) => line.trim() !== "");
}

export function appendBackground(lines: string[], items: string[]): void {
  appendToSection(lines, ensureSection(lines, SECTION.background), toBullets(items));
}

export function backgroundLines(lines: string[]): string[] {
  const heading = findHeading(lines, 2, SECTION.background);
  return heading ? lines.slice(heading.index + 1, sectionEnd(lines, heading.index)) : [];
}

export function replaceResult(lines: string[], items: string[]): void {
  replaceSectionContent(lines, ensureSection(lines, SECTION.result), toBullets(items));
}

/** Unchecked `- [ ]` items anywhere in the body. */
export function openCheckboxes(lines: string[]): string[] {
  return lines.filter((line) => /^\s*[-*+]\s+\[ \]/.test(line)).map((line) => line.trim());
}
