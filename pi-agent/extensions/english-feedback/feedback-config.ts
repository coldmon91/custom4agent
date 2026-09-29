/**
 * Loads the optional evaluator model override from a sidecar JSON file.
 *
 * The file is re-read whenever its mtime changes, so editing it takes effect on
 * the next evaluated input without a restart or `/reload`. Any problem falls
 * back to "use the active model" and is reported to the caller instead of
 * thrown, mirroring the auto-mode-gate classifier config convention.
 *
 * Expected shape: { "model": "provider/modelId" }
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_FILE = "feedback-config.json";

export interface FeedbackModelRef {
  provider: string;
  modelId: string;
}

export interface FeedbackConfig {
  /** Evaluator model override; undefined means use the currently active model. */
  model?: FeedbackModelRef;
  /** First problem found while loading; undefined when the config is usable. */
  problem?: string;
}

const configPath = join(dirname(fileURLToPath(import.meta.url)), CONFIG_FILE);

let cached: FeedbackConfig | undefined;
let cachedMtimeMs: number | undefined;

/** Splits `provider/modelId` on the first slash; the id itself may contain more. */
export function parseModelRef(reference: string): FeedbackModelRef | undefined {
  const separator = reference.indexOf("/");
  if (separator <= 0 || separator === reference.length - 1) return undefined;

  return {
    provider: reference.slice(0, separator),
    modelId: reference.slice(separator + 1),
  };
}

function readConfig(): FeedbackConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    // An absent file is the normal "no override" state, not a problem.
    return {};
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { problem: `${CONFIG_FILE} is not valid JSON (${detail}); using the active model` };
  }

  if (parsed.model === undefined) return {};
  if (typeof parsed.model !== "string") {
    return { problem: `"model" must be a "provider/modelId" string; using the active model` };
  }

  const model = parseModelRef(parsed.model);
  if (!model) {
    return { problem: `"${parsed.model}" is not "provider/modelId"; using the active model` };
  }

  return { model };
}

/**
 * Resolves the configured model ref against the registry, falling back to the
 * active model with a problem note when the ref is unusable. Takes a structural
 * subset of ModelRegistry so it stays testable without pi package imports.
 */
export function resolveConfiguredModel<M>(
  registry: {
    find(provider: string, modelId: string): M | undefined;
    hasConfiguredAuth(model: M): boolean;
  },
  configured: FeedbackModelRef | undefined,
  fallback: M,
): { model: M; problem?: string } {
  if (!configured) return { model: fallback };

  const resolved = registry.find(configured.provider, configured.modelId);
  if (!resolved) {
    return {
      model: fallback,
      problem: `"${configured.provider}/${configured.modelId}" not found in the model registry; using the active model`,
    };
  }
  if (!registry.hasConfiguredAuth(resolved)) {
    return {
      model: fallback,
      problem: `"${configured.provider}/${configured.modelId}" has no configured authentication; using the active model`,
    };
  }

  return { model: resolved };
}

/** Returns the current config, re-reading the file when it has changed on disk. */
export function getFeedbackConfig(): FeedbackConfig {
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

/** For tests; the next call re-reads the file. */
export function clearFeedbackConfigCache(): void {
  cached = undefined;
  cachedMtimeMs = undefined;
}

export function getFeedbackConfigPath(): string {
  return configPath;
}