// Onboarding (references/onboarding.md): settings, folders, template copies, base file, sample task.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  DEFAULT_TASKS, DEFAULT_TEMPLATES, isObsidianVault, readSettings, resolveConfig, settingsPath, type Config, type Settings,
} from "../config.ts";
import { TaskError } from "../errors.ts";
import { ensureDir, notesNamed } from "../file-ops.ts";
import { STATUSES } from "../task-store.ts";
import { referencePath } from "../templates.ts";
import type { CommonOptions } from "../task-context.ts";
import { createTask } from "./create.ts";

export const SAMPLE_TITLE = "sample - 첫 Task";
const SAMPLE_TASK_ID = "1900-000001";
const SAMPLE_BACKGROUND = "managing-tasks 설정 확인용 샘플. 필요 없으면 폴더째 삭제";
const BASE_FILE = "Tasks.base";

export interface InitInput {
  vault?: string;
  tasks?: string;
  templates?: string;
}

type StepResult = { step: string; outcome: "created" | "skipped" | "differs"; path: string; detail?: string };

function expandVault(raw: string): string {
  const expanded = raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\") ? join(homedir(), raw.slice(1)) : raw;
  return resolve(expanded).replace(/[\\/]+$/, "");
}

function settingsStep(input: InitInput, steps: StepResult[]): Settings {
  const path = settingsPath();
  const existing = readSettings(path);
  if (existing) {
    if (input.vault && expandVault(input.vault) !== existing.vault) {
      throw new TaskError("conflict", "settings already point to another vault; confirm with the user and edit setting.json", { path, current: existing });
    }
    steps.push({ step: "settings", outcome: "skipped", path, detail: `vault=${existing.vault}` });
    return existing;
  }
  if (!input.vault) throw new TaskError("config_missing", "no settings yet; ask the user for the vault path and pass --vault", { path });
  const vault = expandVault(input.vault);
  if (!existsSync(vault)) throw new TaskError("vault_missing", `vault not found: ${vault}`, { vault });
  if (!isObsidianVault(vault)) throw new TaskError("not_obsidian_vault", `no .obsidian folder in ${vault}`, { vault });
  const settings: Settings = { vault, tasks: input.tasks ?? DEFAULT_TASKS, templates: input.templates ?? DEFAULT_TEMPLATES };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  steps.push({ step: "settings", outcome: "created", path });
  return settings;
}

function copyOrCompare(step: string, source: string, target: string, transform: (text: string) => string, steps: StepResult[]): void {
  const expected = transform(readFileSync(source, "utf8"));
  if (existsSync(target)) {
    const same = readFileSync(target, "utf8").replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n");
    steps.push({ step, outcome: same ? "skipped" : "differs", path: target, ...(same ? {} : { detail: `differs from ${source}` }) });
    return;
  }
  writeFileSync(target, expected, { encoding: "utf8", flag: "wx" });
  steps.push({ step, outcome: "created", path: target });
}

const identity = (text: string) => text;

export function initVault(input: InitInput, options: CommonOptions): Record<string, unknown> {
  const steps: StepResult[] = [];
  const settings = settingsStep(input, steps);
  const config: Config = resolveConfig(settings);
  if (!isObsidianVault(config.vault)) throw new TaskError("not_obsidian_vault", `no .obsidian folder in ${config.vault}`, { vault: config.vault });

  const year = options.date.slice(0, 4);
  for (const dir of [...STATUSES.map((status) => join(config.tasksDir, year, status)), config.templatesDir]) {
    steps.push({ step: "folder", outcome: ensureDir(dir) ? "created" : "skipped", path: dir });
  }

  for (const name of ["task.md", "subtask.md"]) {
    copyOrCompare("template-copy", referencePath(name), join(config.templatesDir, name), identity, steps);
  }
  const baseTransform = config.tasks === DEFAULT_TASKS
    ? identity
    : (text: string) => text.replaceAll(`file.inFolder("${DEFAULT_TASKS}")`, `file.inFolder(${JSON.stringify(config.tasks)})`);
  copyOrCompare("base", referencePath(BASE_FILE), join(config.tasksDir, BASE_FILE), baseTransform, steps);

  if (notesNamed(config.vault, SAMPLE_TITLE).length > 0) {
    steps.push({ step: "sample", outcome: "skipped", path: SAMPLE_TITLE });
  } else {
    const created = createTask(config, { title: SAMPLE_TITLE, taskId: SAMPLE_TASK_ID, background: [SAMPLE_BACKGROUND] }, options);
    steps.push({ step: "sample", outcome: "created", path: String((created.task as { path: string }).path) });
  }
  return { config, steps };
}
