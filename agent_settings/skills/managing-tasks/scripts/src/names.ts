import { TaskError } from "./errors.ts";

// Obsidian rejects `[ ] # ^ | / \ :` in note names; Windows also rejects `< > " ? *` and control chars.
const FORBIDDEN = /[[\]#^|/\\:<>"?*\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** NFC form: macOS may hand back decomposed (NFD) Hangul in file names. */
export function nfc(value: string): string {
  return value.normalize("NFC");
}

// An ASCII or full-width colon separates parts like `rsmuxer: 내용`, written as ` - ` in titles.
const COLON = /[:：]+/;

/** Title usable as heading, folder name and file name on both macOS and Windows. */
export function sanitizeTitle(raw: string): string {
  const title = nfc(raw)
    .split(COLON)
    .map((part) => part.replace(FORBIDDEN, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "")
    .join(" - ")
    .replace(/[. ]+$/, ""); // Windows strips trailing dots and spaces silently
  if (title === "") throw new TaskError("invalid_title", "title is empty after removing forbidden characters", { raw });
  if (WINDOWS_RESERVED.test(title)) throw new TaskError("invalid_title", `"${title}" is a reserved name on Windows`, { raw });
  return title;
}

export function sameName(a: string, b: string): boolean {
  return nfc(a).toLowerCase() === nfc(b).toLowerCase();
}

export function containsName(haystack: string, needle: string): boolean {
  return nfc(haystack).toLowerCase().includes(nfc(needle).toLowerCase());
}
