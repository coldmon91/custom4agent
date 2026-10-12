import { readFileSync, writeFileSync } from "node:fs";

const BOM = "\uFEFF";

/** A text file as lines, remembering its BOM and line ending so edits keep the original format. */
export interface TextDoc {
  lines: string[];
  eol: "\n" | "\r\n";
  bom: boolean;
}

export function parseText(raw: string): TextDoc {
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(1) : raw;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  return { lines: body.split(/\r?\n/), eol, bom };
}

export function formatText(doc: TextDoc): string {
  return (doc.bom ? BOM : "") + doc.lines.join(doc.eol);
}

// Explicit UTF-8: the Windows default code page (e.g. cp949) would corrupt Korean text.
export function readTextFile(path: string): TextDoc {
  return parseText(readFileSync(path, "utf8"));
}

export function writeTextFile(path: string, doc: TextDoc): void {
  writeFileSync(path, formatText(doc), "utf8");
}
