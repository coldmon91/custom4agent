import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.ts";
import { TaskError } from "./errors.ts";
import { parseText, type TextDoc } from "./text-file.ts";

export type TemplateName = "task.md" | "subtask.md";
export type CopyState = "same" | "differs" | "missing";

/** The skill's own references/ folder; the vault copies are only compared against it. */
const REFERENCES_DIR = join(import.meta.dirname, "..", "..", "references");

export function referencePath(name: string): string {
  return join(REFERENCES_DIR, name);
}

export function loadTemplate(name: TemplateName): TextDoc {
  const path = referencePath(name);
  if (!existsSync(path)) throw new TaskError("template_missing", `template not found: ${path}`, { path });
  return parseText(readFileSync(path, "utf8"));
}

function normalized(path: string): string {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

/** State of the Obsidian Templates copy compared with the skill original (line endings ignored). */
export function templateCopyState(config: Config, name: TemplateName): CopyState {
  const copy = join(config.templatesDir, name);
  if (!existsSync(copy)) return "missing";
  return normalized(copy) === normalized(referencePath(name)) ? "same" : "differs";
}
