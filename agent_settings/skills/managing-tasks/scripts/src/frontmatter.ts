// Line-based frontmatter editing limited to the flat keys and block lists the templates use,
// so untouched lines keep their exact formatting (a YAML round-trip would reformat them).

const DELIMITER = "---";
const KEY_LINE = /^([A-Za-z0-9_-]+):(.*)$/;

export const TASK_KEY_ORDER = [
  "status", "started", "end-date", "task-id", "redmine", "tags",
  "subtask", "git-commit", "priority", "agent-session",
] as const;

interface Entry {
  key: string;
  start: number; // line of `key:`
  end: number; // exclusive
  inline: string; // text after `key:`, trimmed
}

/** Index of the closing delimiter, or -1 when the note has no frontmatter. */
function closingIndex(lines: string[]): number {
  if (lines[0]?.trimEnd() !== DELIMITER) return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === DELIMITER) return i;
  }
  return -1;
}

export function hasFrontmatter(lines: string[]): boolean {
  return closingIndex(lines) > 0;
}

function entries(lines: string[]): Entry[] {
  const close = closingIndex(lines);
  if (close < 0) return [];
  const result: Entry[] = [];
  for (let i = 1; i < close; i++) {
    const match = KEY_LINE.exec(lines[i]);
    if (!match) continue;
    const previous = result.at(-1);
    if (previous) previous.end = i;
    result.push({ key: match[1], start: i, end: close, inline: match[2].trim() });
  }
  return result;
}

function findEntry(lines: string[], key: string): Entry | undefined {
  return entries(lines).find((entry) => entry.key === key);
}

export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    if ((first === '"' || first === "'") && trimmed.at(-1) === first) return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function hasKey(lines: string[], key: string): boolean {
  return findEntry(lines, key) !== undefined;
}

/** Scalar value without quotes; `undefined` when the key is absent, `""` when empty. */
export function getScalar(lines: string[], key: string): string | undefined {
  const entry = findEntry(lines, key);
  return entry ? unquote(entry.inline) : undefined;
}

export function getList(lines: string[], key: string): string[] {
  const entry = findEntry(lines, key);
  if (!entry) return [];
  const items: string[] = [];
  for (let i = entry.start + 1; i < entry.end; i++) {
    const match = /^\s*-\s+(.*)$/.exec(lines[i]);
    if (match && match[1].trim() !== "") items.push(unquote(match[1]));
  }
  return items;
}

/** Inserts `key:` after the nearest preceding key in `order`; no-op when present. */
export function ensureKey(lines: string[], key: string, order: readonly string[] = TASK_KEY_ORDER): void {
  if (hasKey(lines, key)) return;
  const close = closingIndex(lines);
  if (close < 0) throw new Error("note has no frontmatter");
  const existing = entries(lines);
  let insertAt = 1;
  for (const previousKey of order.slice(0, Math.max(order.indexOf(key), 0)).reverse()) {
    const entry = existing.find((candidate) => candidate.key === previousKey);
    if (entry) {
      insertAt = entry.end;
      break;
    }
  }
  lines.splice(insertAt, 0, `${key}:`);
}

/** Replaces the whole entry with `key: value` (empty value leaves just `key:`). */
export function setScalar(lines: string[], key: string, value: string): void {
  ensureKey(lines, key);
  const entry = findEntry(lines, key)!;
  lines.splice(entry.start, entry.end - entry.start, value === "" ? `${key}:` : `${key}: ${value}`);
}

/** Appends a raw YAML item (caller supplies quoting) to a block list. */
export function appendListItem(lines: string[], key: string, rawItem: string): void {
  ensureKey(lines, key);
  const entry = findEntry(lines, key)!;
  if (entry.inline !== "") lines[entry.start] = `${key}:`; // drop inline forms such as `[]`
  let insertAt = entry.start + 1;
  for (let i = entry.start + 1; i < entry.end; i++) {
    if (lines[i].trim() !== "") insertAt = i + 1;
  }
  lines.splice(insertAt, 0, `  - ${rawItem}`);
}

export function quoteYaml(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
