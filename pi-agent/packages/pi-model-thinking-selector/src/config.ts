import { readFileSync } from "node:fs";
import type { KeyId } from "@earendil-works/pi-tui";
import { agentFilePath } from "./json-store";

export const CONFIG_FILE_NAME = "model-thinking-selector.json";

export type SelectorConfig = {
  /** Mirror the picked model into ~/.pi/agent/settings.json so the next session starts from it. */
  persistDefaultModel: boolean;
  /** Mirror the picked effort into settings.json under modelThinkingLevels. */
  persistThinkingLevel: boolean;
  selectorShortcut: KeyId;
  cycleThinkingShortcut: KeyId;
  maxFavoriteModels: number;
  maxRecentModels: number;
  maxVisibleModels: number;
};

const DEFAULT_CONFIG: SelectorConfig = {
  persistDefaultModel: true,
  persistThinkingLevel: true,
  selectorShortcut: "alt+p",
  cycleThinkingShortcut: "ctrl+shift+t",
  maxFavoriteModels: 5,
  maxRecentModels: 5,
  maxVisibleModels: 10,
};

function readBoolean(source: Record<string, unknown>, key: keyof SelectorConfig, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

/** pi validates the key spec when the shortcut is registered; accept any non-empty string here. */
function readShortcut(source: Record<string, unknown>, key: keyof SelectorConfig, fallback: KeyId): KeyId {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? (value.trim() as KeyId) : fallback;
}

function readCount(source: Record<string, unknown>, key: keyof SelectorConfig, fallback: number, max: number): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

/**
 * Config is read once at load time because shortcut registration is synchronous.
 * A missing or malformed file falls back to defaults rather than failing the load.
 */
export function loadConfig(): SelectorConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(agentFilePath(CONFIG_FILE_NAME), "utf8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CONFIG };
  const source = raw as Record<string, unknown>;

  return {
    persistDefaultModel: readBoolean(source, "persistDefaultModel", DEFAULT_CONFIG.persistDefaultModel),
    persistThinkingLevel: readBoolean(source, "persistThinkingLevel", DEFAULT_CONFIG.persistThinkingLevel),
    selectorShortcut: readShortcut(source, "selectorShortcut", DEFAULT_CONFIG.selectorShortcut),
    cycleThinkingShortcut: readShortcut(source, "cycleThinkingShortcut", DEFAULT_CONFIG.cycleThinkingShortcut),
    maxFavoriteModels: readCount(source, "maxFavoriteModels", DEFAULT_CONFIG.maxFavoriteModels, 20),
    maxRecentModels: readCount(source, "maxRecentModels", DEFAULT_CONFIG.maxRecentModels, 20),
    maxVisibleModels: readCount(source, "maxVisibleModels", DEFAULT_CONFIG.maxVisibleModels, 50),
  };
}
