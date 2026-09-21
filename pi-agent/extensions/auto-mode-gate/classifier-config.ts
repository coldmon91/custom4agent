/**
 * Loads the screener's model chain and call settings from JSON.
 *
 * The file is re-read whenever its mtime changes, so editing it takes effect on
 * the next screened call without a restart or `/reload`. A malformed file must
 * never disarm the gate, so every problem falls back to the built-in defaults
 * and is reported rather than thrown.
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClassifierConfig, ModelRef, ThinkingLevelName } from "./types.ts";

const CONFIG_FILE = "classifier-config.json";

const THINKING_LEVELS: ReadonlySet<string> = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

/** Used when the file is absent, unreadable, or has nothing usable in it. */
export const DEFAULT_CONFIG: ClassifierConfig = {
  models: [
    { provider: "together", modelId: "openai/gpt-oss-120b" },
    { provider: "together", modelId: "deepseek-ai/DeepSeek-V4-Flash-0731" },
  ],
  reasoning: "low",
  timeoutMs: 20_000,
  problems: [],
};

const configPath = join(dirname(fileURLToPath(import.meta.url)), CONFIG_FILE);

let cached: ClassifierConfig | undefined;
let cachedMtimeMs: number | undefined;

/** Splits `provider/modelId` on the first slash; the id itself may contain more. */
export function parseModelRef(reference: string): ModelRef | undefined {
  const separator = reference.indexOf("/");
  if (separator <= 0 || separator === reference.length - 1) return undefined;

  return {
    provider: reference.slice(0, separator),
    modelId: reference.slice(separator + 1),
  };
}

function parseModels(raw: unknown, problems: string[]): ModelRef[] {
  if (!Array.isArray(raw)) {
    problems.push('"models" must be an array of "provider/modelId" strings');
    return [];
  }

  const models: ModelRef[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      problems.push(`ignored a non-string entry in "models": ${JSON.stringify(entry)}`);
      continue;
    }

    const ref = parseModelRef(entry);
    if (!ref) {
      problems.push(`ignored "${entry}" in "models": expected "provider/modelId"`);
      continue;
    }

    models.push(ref);
  }

  return models;
}

function parseReasoning(raw: unknown, problems: string[]): ThinkingLevelName {
  if (raw === undefined) return DEFAULT_CONFIG.reasoning;
  if (typeof raw === "string" && THINKING_LEVELS.has(raw)) return raw as ThinkingLevelName;

  problems.push(
    `"reasoning" must be one of ${[...THINKING_LEVELS].join(", ")}; using "${DEFAULT_CONFIG.reasoning}"`,
  );
  return DEFAULT_CONFIG.reasoning;
}

function parseTimeout(raw: unknown, problems: string[]): number {
  if (raw === undefined) return DEFAULT_CONFIG.timeoutMs;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;

  problems.push(`"timeoutMs" must be a positive number; using ${DEFAULT_CONFIG.timeoutMs}`);
  return DEFAULT_CONFIG.timeoutMs;
}

function readConfig(): ClassifierConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return { ...DEFAULT_CONFIG, problems: [`${CONFIG_FILE} not found; using built-in defaults`] };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...DEFAULT_CONFIG,
      problems: [`${CONFIG_FILE} is not valid JSON (${detail}); using built-in defaults`],
    };
  }

  const problems: string[] = [];
  const models = parseModels(parsed.models, problems);
  const reasoning = parseReasoning(parsed.reasoning, problems);
  const timeoutMs = parseTimeout(parsed.timeoutMs, problems);

  if (models.length === 0) {
    problems.push("no usable entries in \"models\"; using built-in defaults");
    return { models: DEFAULT_CONFIG.models, reasoning, timeoutMs, problems };
  }

  return { models, reasoning, timeoutMs, problems };
}

/** Returns the current config, re-reading the file when it has changed on disk. */
export function getClassifierConfig(): ClassifierConfig {
  let mtimeMs: number | undefined;
  try {
    mtimeMs = statSync(configPath).mtimeMs;
  } catch {
    mtimeMs = undefined;
  }

  if (cached && mtimeMs === cachedMtimeMs) return cached;

  cached = readConfig();
  cachedMtimeMs = mtimeMs;
  return cached;
}

/** For diagnostics and tests; the next call re-reads the file. */
export function clearClassifierConfigCache(): void {
  cached = undefined;
  cachedMtimeMs = undefined;
}

export function getClassifierConfigPath(): string {
  return configPath;
}
