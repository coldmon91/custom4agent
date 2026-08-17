import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Api,
  type Model,
  type ModelThinkingLevel,
} from "@earendil-works/pi-ai/compat";
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { thinkingColor } from "./thinking-colors";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const MAX_VISIBLE_MODELS = 10;
const MAX_RECENT_MODELS = 5;
const MAX_FAVORITE_MODELS = 5;
type ThinkingLevel = ModelThinkingLevel;

type FavoriteModelEntry = {
  provider: string;
  modelId: string;
  addedAt: string;
};

type FavoriteModelStore = {
  version: 1;
  items: FavoriteModelEntry[];
};

type RecentModelEntry = {
  provider: string;
  modelId: string;
  lastUsedAt: string;
};

type RecentModelStore = {
  version: 1;
  items: RecentModelEntry[];
};

// Shared resources: ~/.pi/agent/favorite-models.json and recent-models.json.
// Serialize writes inside this process to avoid concurrent overwrite races.
let favoriteModelsWriteQueue: Promise<void> = Promise.resolve();
let recentModelsWriteQueue: Promise<void> = Promise.resolve();

type ModelItem = {
  provider: string;
  modelId: string;
  model: Model<Api>;
  isFavorite: boolean;
  isRecent: boolean;
};

type SelectableModelData = {
  allModels: Model<Api>[];
  recentKeys: string[];
};

function getModelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

function formatModelLabel(model: Model<Api>): string {
  const reasoning = model.reasoning ? "reasoning" : "no-reasoning";
  return `${model.provider}/${model.id} — ${model.name} [${reasoning}]`;
}

function getFavoriteModelsFilePath(): string {
  return join(getAgentDir(), "favorite-models.json");
}

function getRecentModelsFilePath(): string {
  return join(getAgentDir(), "recent-models.json");
}

function readString(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeFavoriteModelStore(data: unknown): FavoriteModelStore {
  const rawItems: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown } | null)?.items)
      ? (data as { items: unknown[] }).items
      : [];

  const items: FavoriteModelEntry[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const provider = readString(item, "provider");
    const modelId = readString(item, "modelId");
    if (!provider || !modelId) continue;

    const key = getModelKey(provider, modelId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ provider, modelId, addedAt: readString(item, "addedAt") ?? new Date(0).toISOString() });
    if (items.length >= MAX_FAVORITE_MODELS) break;
  }

  return { version: 1, items };
}

function normalizeRecentModelStore(data: unknown): RecentModelStore {
  const rawItems: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown } | null)?.items)
      ? (data as { items: unknown[] }).items
      : [];

  const items: RecentModelEntry[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const provider = readString(item, "provider");
    const modelId = readString(item, "modelId");
    if (!provider || !modelId) continue;

    const key = getModelKey(provider, modelId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ provider, modelId, lastUsedAt: readString(item, "lastUsedAt") ?? new Date(0).toISOString() });
    if (items.length >= MAX_RECENT_MODELS) break;
  }

  return { version: 1, items };
}

async function loadFavoriteModelStore(): Promise<FavoriteModelStore> {
  try {
    return normalizeFavoriteModelStore(JSON.parse(await readFile(getFavoriteModelsFilePath(), "utf8")));
  } catch {
    return { version: 1, items: [] };
  }
}

async function saveFavoriteModelStore(store: FavoriteModelStore): Promise<void> {
  const filePath = getFavoriteModelsFilePath();
  await mkdir(getAgentDir(), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function persistFavoriteModelStore(store: FavoriteModelStore): Promise<void> {
  const snapshot: FavoriteModelStore = {
    version: 1,
    items: store.items.map((item) => ({ ...item })),
  };

  favoriteModelsWriteQueue = favoriteModelsWriteQueue
    .catch(() => undefined)
    .then(() => saveFavoriteModelStore(snapshot));

  return favoriteModelsWriteQueue;
}

async function loadRecentModelStore(): Promise<RecentModelStore> {
  try {
    return normalizeRecentModelStore(JSON.parse(await readFile(getRecentModelsFilePath(), "utf8")));
  } catch {
    return { version: 1, items: [] };
  }
}

async function saveRecentModelStore(store: RecentModelStore): Promise<void> {
  const filePath = getRecentModelsFilePath();
  await mkdir(getAgentDir(), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function recordRecentModel(provider: string, modelId: string): Promise<void> {
  const key = getModelKey(provider, modelId);

  recentModelsWriteQueue = recentModelsWriteQueue
    .then(async () => {
      const store = await loadRecentModelStore();
      const items = [
        { provider, modelId, lastUsedAt: new Date().toISOString() },
        ...store.items.filter((item) => getModelKey(item.provider, item.modelId) !== key),
      ].slice(0, MAX_RECENT_MODELS);
      await saveRecentModelStore({ version: 1, items });
    })
    .catch((error) => {
      console.error("Failed to update recent-models.json:", error);
    });

  return recentModelsWriteQueue;
}

async function getRecentModelKeys(ctx: ExtensionContext): Promise<string[]> {
  const store = await loadRecentModelStore();
  const keys = [
    ...(ctx.model ? [getModelKey(ctx.model.provider, ctx.model.id)] : []),
    ...store.items.map((item) => getModelKey(item.provider, item.modelId)),
  ];

  return [...new Set(keys)].slice(0, MAX_RECENT_MODELS);
}

async function getSelectableModelData(ctx: ExtensionContext): Promise<SelectableModelData> {
  const allModels = ctx.modelRegistry
    .getAll()
    .filter((model) => ctx.modelRegistry.hasConfiguredAuth(model))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));

  return { allModels, recentKeys: await getRecentModelKeys(ctx) };
}

function buildSelectableModels(data: SelectableModelData, favoriteStore: FavoriteModelStore): ModelItem[] {
  const byKey = new Map(data.allModels.map((model) => [getModelKey(model.provider, model.id), model] as const));
  const favoriteKeys = favoriteStore.items.map((item) => getModelKey(item.provider, item.modelId));
  const favoriteSet = new Set(favoriteKeys);
  const recentKeys = data.recentKeys.filter((key) => !favoriteSet.has(key));
  const recentSet = new Set(recentKeys);

  const toItem = (model: Model<Api>, isFavorite: boolean, isRecent: boolean): ModelItem => ({
    provider: model.provider,
    modelId: model.id,
    model,
    isFavorite,
    isRecent,
  });

  return [
    ...favoriteKeys
      .map((key) => byKey.get(key))
      .filter((model): model is Model<Api> => Boolean(model))
      .map((model) => toItem(model, true, false)),
    ...recentKeys
      .map((key) => byKey.get(key))
      .filter((model): model is Model<Api> => Boolean(model))
      .map((model) => toItem(model, false, true)),
    ...data.allModels
      .filter((model) => {
        const key = getModelKey(model.provider, model.id);
        return !favoriteSet.has(key) && !recentSet.has(key);
      })
      .map((model) => toItem(model, false, false)),
  ];
}

function normalizeThinkingLevel(level: string): ThinkingLevel {
  return THINKING_LEVELS.includes(level as ThinkingLevel) ? (level as ThinkingLevel) : "off";
}

export default function modelThinkingSelector(pi: ExtensionAPI) {
  pi.on("model_select", async (event) => {
    await recordRecentModel(event.model.provider, event.model.id);
  });

  pi.registerShortcut("ctrl+shift+t", {
    description: "Cycle supported thinking level",
    handler: async (ctx) => {
      const rawCurrent = pi.getThinkingLevel();
      const current = normalizeThinkingLevel(rawCurrent);
      const supportedLevels = ctx.model ? getSupportedThinkingLevels(ctx.model) : [...THINKING_LEVELS];

      if (supportedLevels.length === 0) {
        ctx.ui.notify("This model does not expose a thinking level", "warning");
        return;
      }

      const currentIndex = supportedLevels.indexOf(current);
      pi.setThinkingLevel(supportedLevels[(currentIndex + 1) % supportedLevels.length]);
      ctx.ui.notify(`Effort ${rawCurrent} → ${pi.getThinkingLevel()}`, "info");
    },
  });

  pi.registerShortcut("alt+p", {
    description: "Select model and thinking level",
    handler: async (ctx) => {
      const [modelData, loadedFavoriteStore] = await Promise.all([
        getSelectableModelData(ctx),
        loadFavoriteModelStore(),
      ]);
      let favoriteStore = loadedFavoriteStore;
      let models = buildSelectableModels(modelData, favoriteStore);

      if (models.length === 0) {
        ctx.ui.notify("No configured models available", "warning");
        return;
      }

      const currentModelKey = ctx.model ? getModelKey(ctx.model.provider, ctx.model.id) : "";
      const initialIndex = Math.max(
        0,
        models.findIndex((item) => getModelKey(item.provider, item.modelId) === currentModelKey),
      );

      const result = await ctx.ui.custom<{ model: ModelItem; thinking: ThinkingLevel } | null>(
        (tui, theme, _kb, done) => {
          let modelIndex = initialIndex;
          let thinkingIndex = Math.max(0, THINKING_LEVELS.indexOf(normalizeThinkingLevel(pi.getThinkingLevel())));
          let query = "";
          let scrollOffset = initialIndex;
          let favoriteUpdatePending = false;
          let cachedLines: string[] | undefined;

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function resetSelection() {
            modelIndex = 0;
            scrollOffset = 0;
            refresh();
          }

          function getVisibleModels(): ModelItem[] {
            const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
            if (tokens.length === 0) return models;

            return models.filter((item) => {
              const haystack = `${item.provider} ${item.modelId} ${item.model.name}`.toLowerCase();
              return tokens.every((token) => haystack.includes(token));
            });
          }

          // Keeps the cursor inside the list and scrolls the viewport to follow it.
          function clampModelIndex() {
            const visibleModels = getVisibleModels();
            if (visibleModels.length === 0) {
              modelIndex = 0;
              scrollOffset = 0;
              return;
            }

            modelIndex = Math.min(Math.max(0, modelIndex), visibleModels.length - 1);
            if (modelIndex < scrollOffset) {
              scrollOffset = modelIndex;
            } else if (modelIndex >= scrollOffset + MAX_VISIBLE_MODELS) {
              scrollOffset = modelIndex - MAX_VISIBLE_MODELS + 1;
            }
            const maxOffset = Math.max(0, visibleModels.length - MAX_VISIBLE_MODELS);
            scrollOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
          }

          async function toggleFavorite(): Promise<void> {
            if (favoriteUpdatePending) return;

            const selectedModel = getVisibleModels()[modelIndex];
            if (!selectedModel) return;

            const selectedKey = getModelKey(selectedModel.provider, selectedModel.modelId);
            const favoriteIndex = favoriteStore.items.findIndex(
              (item) => getModelKey(item.provider, item.modelId) === selectedKey,
            );

            if (favoriteIndex < 0 && favoriteStore.items.length >= MAX_FAVORITE_MODELS) {
              ctx.ui.notify(`You can register up to ${MAX_FAVORITE_MODELS} favorite models`, "warning");
              return;
            }

            const previousStore = favoriteStore;
            const nextItems =
              favoriteIndex >= 0
                ? favoriteStore.items.filter((_, index) => index !== favoriteIndex)
                : [
                    {
                      provider: selectedModel.provider,
                      modelId: selectedModel.modelId,
                      addedAt: new Date().toISOString(),
                    },
                    ...favoriteStore.items,
                  ];

            favoriteStore = { version: 1, items: nextItems };
            models = buildSelectableModels(modelData, favoriteStore);
            modelIndex = Math.max(
              0,
              getVisibleModels().findIndex((item) => getModelKey(item.provider, item.modelId) === selectedKey),
            );
            scrollOffset = 0;
            clampModelIndex();
            refresh();

            favoriteUpdatePending = true;
            try {
              await persistFavoriteModelStore(favoriteStore);
            } catch (error) {
              favoriteStore = previousStore;
              models = buildSelectableModels(modelData, favoriteStore);
              modelIndex = Math.max(
                0,
                getVisibleModels().findIndex((item) => getModelKey(item.provider, item.modelId) === selectedKey),
              );
              scrollOffset = 0;
              clampModelIndex();
              refresh();
              const message = error instanceof Error ? error.message : String(error);
              ctx.ui.notify(`Failed to update favorite models: ${message}`, "error");
            } finally {
              favoriteUpdatePending = false;
            }
          }

          function handleInput(data: string) {
            const visibleModels = getVisibleModels();

            if (matchesKey(data, Key.space)) {
              void toggleFavorite();
              return;
            }
            if (matchesKey(data, Key.up)) {
              modelIndex = Math.max(0, modelIndex - 1);
              refresh();
              return;
            }
            if (matchesKey(data, Key.down)) {
              modelIndex = Math.min(Math.max(0, visibleModels.length - 1), modelIndex + 1);
              refresh();
              return;
            }
            if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
              const selectedModel = visibleModels[modelIndex]?.model;
              if (!selectedModel?.reasoning) return;

              const supportedLevels = getSupportedThinkingLevels(selectedModel);
              if (supportedLevels.length === 0) return;

              // Step within the model's own levels, then map back onto the global scale.
              const direction = matchesKey(data, Key.left) ? -1 : 1;
              const effective = clampThinkingLevel(selectedModel, THINKING_LEVELS[thinkingIndex]);
              const nextIndex = Math.min(
                supportedLevels.length - 1,
                Math.max(0, supportedLevels.indexOf(effective) + direction),
              );
              const globalIndex = THINKING_LEVELS.indexOf(supportedLevels[nextIndex]);
              if (globalIndex >= 0 && globalIndex !== thinkingIndex) {
                thinkingIndex = globalIndex;
                refresh();
              }
              return;
            }
            if (matchesKey(data, Key.backspace) || matchesKey(data, Key.delete)) {
              if (query.length > 0) {
                query = query.slice(0, -1);
                resetSelection();
              }
              return;
            }
            if (matchesKey(data, Key.enter)) {
              clampModelIndex();
              const selected = getVisibleModels()[modelIndex];
              if (selected) {
                done({
                  model: selected,
                  thinking: clampThinkingLevel(selected.model, THINKING_LEVELS[thinkingIndex]),
                });
              }
              return;
            }
            if (matchesKey(data, Key.escape)) {
              if (query.length > 0) {
                query = "";
                resetSelection();
                return;
              }
              done(null);
              return;
            }

            const isPrintable = data.length === 1 && data >= " " && data !== "\x7f";
            if (isPrintable) {
              query += data;
              resetSelection();
            }
          }

          function renderEffortSuffix(model: Model<Api>, requested: ThinkingLevel, effective: ThinkingLevel): string {
            if (!model.reasoning) return theme.fg("dim", " · effort unavailable");

            const label = `${theme.fg("dim", " · effort ")}${theme.fg(thinkingColor(requested), requested)}`;
            if (effective === requested) return label;
            return `${label}${theme.fg("dim", " → ")}${theme.fg(thinkingColor(effective), effective)}`;
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const renderWidth = Math.max(40, width);
            const visibleModels = getVisibleModels();
            clampModelIndex();
            const selectedModel = visibleModels[modelIndex]?.model;
            const requestedThinking = THINKING_LEVELS[thinkingIndex];
            const effectiveThinking = selectedModel
              ? clampThinkingLevel(selectedModel, requestedThinking)
              : requestedThinking;

            const title = `Model selector${currentModelKey ? ` · current ${currentModelKey}` : ""}`;
            lines.push(theme.fg("accent", "─".repeat(renderWidth)));
            lines.push(...wrapTextWithAnsi(theme.fg("text", title), renderWidth));
            lines.push(theme.fg("muted", `Search: ${query || "(type to filter)"}`));
            lines.push("");

            if (visibleModels.length === 0) {
              lines.push(theme.fg("warning", "No matching models"));
            }

            const windowStart = scrollOffset;
            const windowEnd = Math.min(visibleModels.length, windowStart + MAX_VISIBLE_MODELS);
            if (visibleModels.length > MAX_VISIBLE_MODELS) {
              lines.push(theme.fg("muted", `Showing ${windowStart + 1}-${windowEnd} of ${visibleModels.length}`));
              lines.push("");
            }

            let group: "favorite" | "recent" | "all" | undefined;

            for (let i = windowStart; i < windowEnd; i++) {
              const item = visibleModels[i];
              const itemGroup = item.isFavorite ? "favorite" : item.isRecent ? "recent" : "all";
              if (itemGroup !== group) {
                if (group) lines.push("");
                const groupLabel =
                  itemGroup === "favorite"
                    ? "Favorite models"
                    : itemGroup === "recent"
                      ? "Recent models"
                      : "All models";
                lines.push(theme.fg("muted", groupLabel));
                group = itemGroup;
              }

              const selected = i === modelIndex;
              const isCurrent = getModelKey(item.provider, item.modelId) === currentModelKey;
              const prefix = selected ? theme.fg("accent", "> ") : "  ";
              const favoriteMark = item.isFavorite ? "★ " : "  ";
              const baseLabel = `${isCurrent ? "● " : "  "}${favoriteMark}${formatModelLabel(item.model)}`;
              const labelColor = selected ? "accent" : isCurrent ? "success" : "text";
              const effortSuffix = selected
                ? renderEffortSuffix(item.model, requestedThinking, effectiveThinking)
                : "";
              const wrapped = wrapTextWithAnsi(
                `${theme.fg(labelColor, baseLabel)}${effortSuffix}`,
                Math.max(1, renderWidth - visibleWidth(prefix)),
              );

              for (const line of wrapped) {
                lines.push(`${prefix}${line}`);
              }
            }

            lines.push("");
            if (selectedModel && !selectedModel.reasoning) {
              lines.push(theme.fg("warning", "* This model does not support reasoning; effort selection is disabled."));
            }
            lines.push(theme.fg("dim", "Type to search • Space favorite • Backspace delete • ↑↓ model • ←→ effort • Enter apply • Esc clear/cancel"));
            lines.push(theme.fg("accent", "─".repeat(renderWidth)));

            cachedLines = lines;
            return lines;
          }

          return {
            render,
            invalidate: () => {
              cachedLines = undefined;
            },
            handleInput,
          };
        },
      );

      if (!result) return;

      const { provider, modelId, model } = result.model;
      const selectedKey = getModelKey(provider, modelId);
      const modelChanged = !ctx.model || ctx.model.provider !== provider || ctx.model.id !== modelId;

      if (modelChanged) {
        const ok = await pi.setModel(model);
        if (!ok) {
          ctx.ui.notify(`No API key for ${selectedKey}`, "error");
          return;
        }
      }

      pi.setThinkingLevel(result.thinking);
      ctx.ui.notify(`Switched to ${selectedKey} / effort ${pi.getThinkingLevel()}`, "info");
    },
  });
}
