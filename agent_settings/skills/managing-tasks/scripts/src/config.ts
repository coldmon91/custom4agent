import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { TaskError } from "./errors.ts";

export interface Settings {
  vault: string;
  tasks: string;
  templates: string;
}

export interface Config extends Settings {
  settingsPath: string;
  tasksDir: string;
  templatesDir: string;
}

export const DEFAULT_TASKS = "Tasks";
export const DEFAULT_TEMPLATES = "Templates";

/** `MANAGING_TASKS_SETTINGS` overrides the location (used by tests). */
export function settingsPath(): string {
  return process.env.MANAGING_TASKS_SETTINGS ?? join(homedir(), ".config", "managing-tasks", "setting.json");
}

export function isObsidianVault(vault: string): boolean {
  return existsSync(join(vault, ".obsidian"));
}

export function readSettings(path = settingsPath()): Settings | undefined {
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new TaskError("config_invalid", `cannot parse ${path}: ${(error as Error).message}`, { path });
  }
  const value = parsed as Partial<Record<keyof Settings, unknown>>;
  if (typeof value.vault !== "string" || !isAbsolute(value.vault)) {
    throw new TaskError("config_invalid", "`vault` must be an absolute path", { path });
  }
  return {
    vault: value.vault,
    tasks: typeof value.tasks === "string" ? value.tasks : DEFAULT_TASKS,
    templates: typeof value.templates === "string" ? value.templates : DEFAULT_TEMPLATES,
  };
}

export function resolveConfig(settings: Settings, path = settingsPath()): Config {
  return {
    ...settings,
    settingsPath: path,
    tasksDir: join(settings.vault, settings.tasks),
    templatesDir: join(settings.vault, settings.templates),
  };
}

/** Loads settings and checks the vault layout; every command except `init` starts here. */
export function loadConfig(): Config {
  const path = settingsPath();
  const settings = readSettings(path);
  if (!settings) throw new TaskError("config_missing", `${path} not found; run onboarding (init)`, { path });
  const config = resolveConfig(settings, path);
  if (!existsSync(config.vault)) throw new TaskError("vault_missing", `vault not found: ${config.vault}`, { vault: config.vault });
  if (!existsSync(config.tasksDir)) {
    throw new TaskError("tasks_dir_missing", `tasks folder not found: ${config.tasksDir}; run onboarding (init)`, { tasksDir: config.tasksDir });
  }
  return config;
}
