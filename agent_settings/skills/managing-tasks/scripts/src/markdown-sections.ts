// Generic heading/section helpers over note lines. Headings inside the frontmatter
// or fenced code blocks are ignored.

export interface Heading {
  index: number;
  level: number;
  title: string;
}

const HEADING = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^\s*(```|~~~)/;

function bodyStart(lines: string[]): number {
  if (lines[0]?.trimEnd() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") return i + 1;
  }
  return 0;
}

export function headings(lines: string[]): Heading[] {
  const result: Heading[] = [];
  let fence: string | null = null;
  for (let i = bodyStart(lines); i < lines.length; i++) {
    const fenceMatch = FENCE.exec(lines[i]);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fence === fenceMatch[1]) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = HEADING.exec(lines[i]);
    if (match) result.push({ index: i, level: match[1].length, title: (match[2] ?? "").trim() });
  }
  return result;
}

/** Exclusive end of the section opened by the heading at `index`. */
export function sectionEnd(lines: string[], index: number): number {
  const all = headings(lines);
  const own = all.find((heading) => heading.index === index);
  if (!own) throw new Error(`no heading at line ${index}`);
  const next = all.find((heading) => heading.index > index && heading.level <= own.level);
  return next ? next.index : lines.length;
}

export function findHeading(
  lines: string[], level: number, title: string, from = 0, to = lines.length,
): Heading | undefined {
  return headings(lines).find(
    (heading) => heading.level === level && heading.title === title && heading.index >= from && heading.index < to,
  );
}

/** Line right after the last non-blank line in (lowerBound, upperBound); keeps blank separators below it. */
export function afterLastContent(lines: string[], lowerBound: number, upperBound: number): number {
  let position = upperBound;
  while (position - 1 > lowerBound && lines[position - 1].trim() === "") position--;
  return position;
}

export function isEmptyBullet(line: string): boolean {
  return line.trim() === "-";
}

/** Removes placeholder `- ` bullets in [from, to); returns how many lines were removed. */
export function removeEmptyBullets(lines: string[], from: number, to: number): number {
  let removed = 0;
  for (let i = to - 1; i >= from; i--) {
    if (isEmptyBullet(lines[i])) {
      lines.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/**
 * Replaces the content of the section at `headingIndex` with `content`,
 * keeping the blank lines that separated it from the next heading.
 */
export function replaceSectionContent(lines: string[], headingIndex: number, content: string[]): void {
  const end = sectionEnd(lines, headingIndex);
  const contentEnd = afterLastContent(lines, headingIndex, end);
  lines.splice(headingIndex + 1, contentEnd - headingIndex - 1, ...content);
}
