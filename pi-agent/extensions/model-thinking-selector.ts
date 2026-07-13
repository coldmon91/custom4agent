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
type ThinkingLevel = ModelThinkingLevel;

type RecentModelStore = {
  version: 1;
  items: Array<{
    provider: string;
    modelId: string;
    lastUsedAt: string;
  }>;
};

const EMPTY_RECENT_MODEL_STORE: RecentModelStore = { version: 1, items: [] };

// Shared resource: ~/.pi/agent/recent-models.json
// Serialize writes inside this process to avoid concurrent overwrite races.
let recentModelsWriteQueue: Promise<void> = Promise.resolve();

type ModelItem = {
  provider: string;
  modelId: string;
  model: Model<Api>;
  isRecent?: boolean;
};

function formatModelLabel(model: Model<Api>): string {
  const reasoning = model.reasoning ? "reasoning" : "no-reasoning";
  return `${model.provider}/${model.id} — ${model.name} [${reasoning}]`;
}

function effectiveThinkingFor(model: Model<Api>, requested: ThinkingLevel): ThinkingLevel {
  return clampThinkingLevel(model, requested);
}

function getRecentModelsFilePath(): string {
  return join(getAgentDir(), "recent-models.json");
}

function getModelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

function normalizeRecentModelStore(data: unknown): RecentModelStore {
  const rawItems = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: unknown[] }).items
      : [];

  const items: RecentModelStore["items"] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const provider = typeof (item as { provider?: unknown }).provider === "string" ? (item as { provider: string }).provider : "";
    const modelId = typeof (item as { modelId?: unknown }).modelId === "string" ? (item as { modelId: string }).modelId : "";
    const lastUsedAt =
      typeof (item as { lastUsedAt?: unknown }).lastUsedAt === "string"
        ? (item as { lastUsedAt: string }).lastUsedAt
        : new Date(0).toISOString();
    if (!provider || !modelId) continue;

    const key = getModelKey(provider, modelId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ provider, modelId, lastUsedAt });
    if (items.length >= MAX_RECENT_MODELS) break;
  }

  return { version: 1, items };
}

async function loadRecentModelStore(): Promise<RecentModelStore> {
  try {
    const content = await readFile(getRecentModelsFilePath(), "utf8");
    return normalizeRecentModelStore(JSON.parse(content));
  } catch {
    return EMPTY_RECENT_MODEL_STORE;
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
  recentModelsWriteQueue = recentModelsWriteQueue
    .then(async () => {
      const store = await loadRecentModelStore();
      const items: RecentModelStore["items"] = [
        { provider, modelId, lastUsedAt: new Date().toISOString() },
        ...store.items.filter((item) => getModelKey(item.provider, item.modelId) !== getModelKey(provider, modelId)),
      ].slice(0, MAX_RECENT_MODELS);
      await saveRecentModelStore({ version: 1, items });
    })
    .catch((error) => {
      console.error("Failed to update recent-models.json:", error);
    });

  return recentModelsWriteQueue;
}

async function getRecentModelKeys(ctx: ExtensionContext): Promise<string[]> {
  const keys: string[] = [];
  const seen = new Set<string>();

  if (ctx.model) {
    const currentKey = getModelKey(ctx.model.provider, ctx.model.id);
    keys.push(currentKey);
    seen.add(currentKey);
  }

  const store = await loadRecentModelStore();
  for (const item of store.items) {
    const key = getModelKey(item.provider, item.modelId);
    if (seen.has(key)) continue;
    keys.push(key);
    seen.add(key);
    if (keys.length >= MAX_RECENT_MODELS) break;
  }

  return keys.slice(0, MAX_RECENT_MODELS);
}

async function getSelectableModels(ctx: ExtensionContext): Promise<ModelItem[]> {
  const allModels = ctx.modelRegistry
    .getAll()
    .filter((model) => ctx.modelRegistry.hasConfiguredAuth(model))
    .sort((a, b) => {
      const providerCmp = a.provider.localeCompare(b.provider);
      if (providerCmp !== 0) return providerCmp;
      return a.id.localeCompare(b.id);
    });

  const byKey = new Map(
    allModels.map((model) => [getModelKey(model.provider, model.id), model] as const),
  );
  const recentKeys = await getRecentModelKeys(ctx);
  const recentModels: ModelItem[] = recentKeys
    .map((key) => byKey.get(key))
    .filter((model): model is Model<Api> => Boolean(model))
    .map((model) => ({
      provider: model.provider,
      modelId: model.id,
      model,
      isRecent: true,
    }));

  const recentSet = new Set(recentKeys);
  const remainingModels: ModelItem[] = allModels
    .filter((model) => !recentSet.has(getModelKey(model.provider, model.id)))
    .map((model) => ({
      provider: model.provider,
      modelId: model.id,
      model,
    }));

  return [...recentModels, ...remainingModels];
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
      const requested = supportedLevels[(currentIndex + 1) % supportedLevels.length];
      pi.setThinkingLevel(requested);
      ctx.ui.notify(`Effort ${rawCurrent} → ${pi.getThinkingLevel()}`, "info");
    },
  });

  pi.registerShortcut("alt+p", {
    description: "Select model and thinking level",
    handler: async (ctx) => {
      const models = await getSelectableModels(ctx);

      if (models.length === 0) {
        ctx.ui.notify("No configured models available", "warning");
        return;
      }

      const currentModelKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
      const initialIndex = Math.max(
        0,
        models.findIndex((m) => `${m.provider}/${m.modelId}` === currentModelKey),
      );

      const result = await ctx.ui.custom<{ model: ModelItem; thinking: ThinkingLevel } | null>(
        (tui, theme, _kb, done) => {
          let modelIndex = initialIndex >= 0 ? initialIndex : 0;
          let thinkingIndex = THINKING_LEVELS.indexOf(normalizeThinkingLevel(pi.getThinkingLevel()));
          if (thinkingIndex < 0) thinkingIndex = 0;
          let query = "";
          let scrollOffset = Math.max(0, initialIndex);
          let cachedLines: string[] | undefined;

          function refresh() {
            cachedLines = undefined;
            tui.requestRender();
          }

          function getVisibleModels(): ModelItem[] {
            const normalized = query.trim().toLowerCase();
            if (!normalized) return models;

            const tokens = normalized.split(/\s+/).filter(Boolean);
            return models.filter((item) => {
              const haystack = `${item.provider} ${item.modelId} ${item.model.name}`.toLowerCase();
              return tokens.every((token) => haystack.includes(token));
            });
          }

          function ensureModelViewport(visibleModels: ModelItem[]) {
            const maxOffset = Math.max(0, visibleModels.length - MAX_VISIBLE_MODELS);
            if (modelIndex < scrollOffset) {
              scrollOffset = modelIndex;
            } else if (modelIndex >= scrollOffset + MAX_VISIBLE_MODELS) {
              scrollOffset = modelIndex - MAX_VISIBLE_MODELS + 1;
            }
            scrollOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
          }

          function clampModelIndex() {
            const visibleModels = getVisibleModels();
            if (visibleModels.length === 0) {
              modelIndex = 0;
              scrollOffset = 0;
              return;
            }
            modelIndex = Math.min(Math.max(0, modelIndex), visibleModels.length - 1);
            ensureModelViewport(visibleModels);
          }

          function getPrintableInput(data: string): string | undefined {
            if (data.length === 1 && data >= " " && data !== "\x7f") return data;
            return undefined;
          }

          function handleInput(data: string) {
            const visibleModels = getVisibleModels();

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
              if (selectedModel?.reasoning) {
                const supportedLevels = getSupportedThinkingLevels(selectedModel);
                if (supportedLevels.length === 0) return;

                const requested = THINKING_LEVELS[thinkingIndex];
                const effective = effectiveThinkingFor(selectedModel, requested);
                const currentIndex = supportedLevels.indexOf(effective);
                const direction = matchesKey(data, Key.left) ? -1 : 1;
                const nextIndex = Math.min(
                  supportedLevels.length - 1,
                  Math.max(0, currentIndex + direction),
                );
                const nextLevel = supportedLevels[nextIndex];
                const globalIndex = THINKING_LEVELS.indexOf(nextLevel);
                if (globalIndex >= 0 && globalIndex !== thinkingIndex) {
                  thinkingIndex = globalIndex;
                  refresh();
                }
              }
              return;
            }
            if (matchesKey(data, Key.backspace) || matchesKey(data, Key.delete)) {
              if (query.length > 0) {
                query = query.slice(0, -1);
                modelIndex = 0;
                scrollOffset = 0;
                refresh();
              }
              return;
            }
            if (matchesKey(data, Key.enter)) {
              clampModelIndex();
              const selectedModel = getVisibleModels()[modelIndex];
              if (selectedModel) {
                done({
                  model: selectedModel,
                  thinking: effectiveThinkingFor(selectedModel.model, THINKING_LEVELS[thinkingIndex]),
                });
              }
              return;
            }
            if (matchesKey(data, Key.escape)) {
              if (query.length > 0) {
                query = "";
                modelIndex = 0;
                scrollOffset = 0;
                refresh();
                return;
              }
              done(null);
              return;
            }

            const printable = getPrintableInput(data);
            if (printable) {
              query += printable;
              modelIndex = 0;
              scrollOffset = 0;
              refresh();
            }
          }

          function render(width: number): string[] {
            if (cachedLines) return cachedLines;

            const lines: string[] = [];
            const renderWidth = Math.max(40, width);
            const visibleModels = getVisibleModels();
            clampModelIndex();
            const selectedModel = visibleModels[modelIndex]?.model;
            const requestedThinking = THINKING_LEVELS[thinkingIndex];
            const effectiveThinking = selectedModel ? effectiveThinkingFor(selectedModel, requestedThinking) : requestedThinking;
            const requestedEffortText = theme.fg(thinkingColor(requestedThinking), requestedThinking);
            const effectiveEffortText = theme.fg(thinkingColor(effectiveThinking), effectiveThinking);

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

            let insertedRecentHeader = false;
            let insertedAllHeader = false;

            for (let i = windowStart; i < windowEnd; i++) {
              const item = visibleModels[i];
              if (item.isRecent && !insertedRecentHeader) {
                lines.push(theme.fg("muted", "Recent models"));
                insertedRecentHeader = true;
              }
              if (!item.isRecent && !insertedAllHeader) {
                if (insertedRecentHeader) lines.push("");
                lines.push(theme.fg("muted", "All models"));
                insertedAllHeader = true;
              }

              const selected = i === modelIndex;
              const isCurrent = `${item.provider}/${item.modelId}` === currentModelKey;
              const prefix = selected ? theme.fg("accent", "> ") : "  ";
              const baseLabel = `${isCurrent ? "● " : "  "}${formatModelLabel(item.model)}`;
              const effortSuffix = selected
                ? item.model.reasoning
                  ? effectiveThinking === requestedThinking
                    ? `${theme.fg("dim", " · effort ")}${requestedEffortText}`
                    : `${theme.fg("dim", " · effort ")}${requestedEffortText}${theme.fg("dim", " → ")}${effectiveEffortText}`
                  : theme.fg("dim", " · effort unavailable")
                : "";
              const labelColor = selected ? "accent" : isCurrent ? "success" : "text";
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
            lines.push(theme.fg("dim", "Type to search • Backspace delete • ↑↓ model • ←→ effort • Enter apply • Esc clear/cancel"));
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

      const modelChanged = !ctx.model || ctx.model.provider !== result.model.provider || ctx.model.id !== result.model.modelId;
      if (modelChanged) {
        const ok = await pi.setModel(result.model.model);
        if (!ok) {
          ctx.ui.notify(`No API key for ${result.model.provider}/${result.model.modelId}`, "error");
          return;
        }
      }

      pi.setThinkingLevel(result.thinking);
      const effectiveThinking = pi.getThinkingLevel();
      ctx.ui.notify(`Switched to ${result.model.provider}/${result.model.modelId} / effort ${effectiveThinking}`, "info");
    },
  });
}
