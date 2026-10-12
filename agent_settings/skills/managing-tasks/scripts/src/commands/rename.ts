import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { markdownFiles, moveNoOverwrite, notesNamed } from "../file-ops.ts";
import { getList, getScalar, setScalar } from "../frontmatter.ts";
import { nfc, sameName, sanitizeTitle } from "../names.ts";
import { setTitleHeading } from "../note-body.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";
import { readTextFile, writeTextFile } from "../text-file.ts";
import { subtaskName } from "./subtask.ts";

/** Rewrites `[[old]]`, `[[old|…]]` and `[[old#…]]` links; shell renames skip Obsidian's own link update. */
function replaceLinks(vault: string, oldName: string, newName: string): string[] {
  const changed: string[] = [];
  const replacements = ["]]", "|", "#"].map((suffix) => [`[[${oldName}${suffix}`, `[[${newName}${suffix}`] as const);
  for (const path of markdownFiles(vault)) {
    const original = readFileSync(path, "utf8");
    if (!original.includes(`[[${oldName}`)) continue;
    let updated = original;
    for (const [from, to] of replacements) updated = updated.replaceAll(from, to);
    if (updated !== original) {
      writeFileSync(path, updated, "utf8");
      changed.push(path);
    }
  }
  return changed;
}

function renameSubtaskParents(folder: string, subtasks: string[], oldName: string, newName: string): string[] {
  const changed: string[] = [];
  for (const name of subtasks) {
    const path = join(folder, `${name}.md`);
    if (!existsSync(path)) continue;
    const note = readTextFile(path);
    if (!sameName(getScalar(note.lines, "parent") ?? "", oldName)) continue;
    setScalar(note.lines, "parent", newName);
    writeTextFile(path, note);
    changed.push(path);
  }
  return changed;
}

export function renameTask(config: Config, query: string, rawTitle: string, options: CommonOptions): Record<string, unknown> {
  const task = openTask(config, query, options);
  const { ref } = task;
  if (!ref.isFolder) throw new TaskError("invalid_value", `"${ref.name}" is a single-file task; convert it to a folder first`);
  const oldName = ref.name;
  const newName = sanitizeTitle(rawTitle);
  if (nfc(newName) === nfc(oldName)) throw new TaskError("invalid_value", "the new title equals the current one");

  const caseOnly = sameName(newName, oldName);
  const clashes = caseOnly ? [] : notesNamed(config.vault, newName);
  const newFolder = join(dirname(ref.entryPath), newName);
  if (clashes.length > 0 || (!caseOnly && existsSync(newFolder))) {
    throw new TaskError("conflict", `"${newName}" already exists`, { existing: clashes.length > 0 ? clashes : [newFolder] });
  }

  // Rename the note inside the old folder first, then the folder; undo the note on folder failure.
  const renamedNote = join(ref.entryPath, `${newName}.md`);
  moveNoOverwrite(task.notePath, renamedNote);
  try {
    moveNoOverwrite(ref.entryPath, newFolder);
  } catch (error) {
    moveNoOverwrite(renamedNote, task.notePath);
    throw error;
  }
  ref.entryPath = newFolder;
  ref.name = newName;
  task.notePath = join(newFolder, `${newName}.md`);

  setTitleHeading(task.doc.lines, newName);
  const subtasks = getList(task.doc.lines, "subtask").map(subtaskName);
  const parentsUpdated = renameSubtaskParents(newFolder, subtasks, oldName, newName);
  const session = saveTask(task, options);
  const linksUpdated = replaceLinks(config.vault, oldName, newName);
  return { task: describe(task), from: oldName, parentsUpdated, linksUpdated, session, notices: task.notices };
}
