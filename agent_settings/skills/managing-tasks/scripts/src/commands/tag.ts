import type { Config } from "../config.ts";
import { TaskError } from "../errors.ts";
import { getList, setList } from "../frontmatter.ts";
import { nfc } from "../names.ts";
import { describe, openTask, saveTask, type CommonOptions } from "../task-context.ts";

export interface TagInput {
  query: string;
  add: string[];
  remove: string[];
}

// Obsidian tags: letters, digits, `_`, `-`, `/` (nesting), not all digits. These are also plain YAML scalars.
const TAG = /^[\p{L}\p{N}_][\p{L}\p{N}_\-/]*$/u;

/** Accepts `#bug` or `bug`; rejects what Obsidian would not treat as a tag. */
export function parseTag(raw: string): string {
  const tag = nfc(raw.trim()).replace(/^#/, "");
  if (!TAG.test(tag) || /^\p{N}+$/u.test(tag)) {
    throw new TaskError("invalid_value", `"${raw}" is not a valid tag (letters, digits, _ - / only, not all digits)`);
  }
  return tag;
}

export function editTags(config: Config, input: TagInput, options: CommonOptions): Record<string, unknown> {
  const add = input.add.map(parseTag);
  const remove = input.remove.map(parseTag);
  if (add.length === 0 && remove.length === 0) throw new TaskError("usage", "tag needs --add or --remove");
  const both = add.filter((tag) => remove.includes(tag));
  if (both.length > 0) throw new TaskError("invalid_value", `tag both added and removed: ${both.join(", ")}`);

  const task = openTask(config, input.query, options);
  const before = getList(task.doc.lines, "tags");
  const kept = before.filter((tag) => !remove.includes(tag));
  const tags = [...new Set([...kept, ...add])];
  const changed = tags.length !== before.length || tags.some((tag, i) => tag !== before[i]);
  if (!changed) return { task: describe(task), tags, changed: false, notices: task.notices };

  setList(task.doc.lines, "tags", tags);
  const session = saveTask(task, options);
  return {
    task: describe(task),
    tags,
    added: tags.filter((tag) => !before.includes(tag)),
    removed: before.filter((tag) => !tags.includes(tag)),
    changed: true,
    session,
    notices: task.notices,
  };
}
