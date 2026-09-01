import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import { Key, matchesKey, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { SelectorConfig } from "./config";
import { buildSelectableModels } from "./model-list";
import { persistFavoriteModelStore } from "./model-stores";
import {
  formatModelLabel,
  getModelKey,
  normalizeThinkingLevel,
  THINKING_LEVELS,
  type FavoriteModelStore,
  type ModelItem,
  type SelectableModelData,
  type ThinkingLevel,
} from "./models";
import { thinkingColor } from "./thinking-colors";

export type SelectorResult = { model: ModelItem; thinking: ThinkingLevel };

export type SelectorViewOptions = {
  ctx: ExtensionContext;
  config: SelectorConfig;
  modelData: SelectableModelData;
  favoriteStore: FavoriteModelStore;
  currentThinking: string;
};

/**
 * Full-width picker combining model search, favorites, and effort selection.
 * Resolves with the chosen model, or null when the list is empty or the user cancels.
 */
export async function showModelSelector(options: SelectorViewOptions): Promise<SelectorResult | null> {
  const { ctx, config, modelData } = options;
  let favoriteStore = options.favoriteStore;
  let models = buildSelectableModels(modelData, favoriteStore);

  if (models.length === 0) {
    ctx.ui.notify("No configured models available", "warning");
    return null;
  }

  const currentModelKey = ctx.model ? getModelKey(ctx.model.provider, ctx.model.id) : "";
  const initialIndex = Math.max(
    0,
    models.findIndex((item) => getModelKey(item.provider, item.modelId) === currentModelKey),
  );

  return await ctx.ui.custom<SelectorResult | null>((tui, theme, _kb, done) => {
    let modelIndex = initialIndex;
    let thinkingIndex = Math.max(
      0,
      THINKING_LEVELS.indexOf(normalizeThinkingLevel(options.currentThinking)),
    );
    let query = "";
    let scrollOffset = initialIndex;
    let favoriteUpdatePending = false;
    let cachedWidth: number | undefined;
    let cachedLines: string[] | undefined;

    function clearRenderCache() {
      cachedWidth = undefined;
      cachedLines = undefined;
    }

    function refresh() {
      clearRenderCache();
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
      } else if (modelIndex >= scrollOffset + config.maxVisibleModels) {
        scrollOffset = modelIndex - config.maxVisibleModels + 1;
      }
      const maxOffset = Math.max(0, visibleModels.length - config.maxVisibleModels);
      scrollOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
    }

    function selectKeyAfterRebuild(selectedKey: string) {
      models = buildSelectableModels(modelData, favoriteStore);
      modelIndex = Math.max(
        0,
        getVisibleModels().findIndex((item) => getModelKey(item.provider, item.modelId) === selectedKey),
      );
      scrollOffset = 0;
      clampModelIndex();
      refresh();
    }

    async function toggleFavorite(): Promise<void> {
      if (favoriteUpdatePending) return;

      const selectedModel = getVisibleModels()[modelIndex];
      if (!selectedModel) return;

      const selectedKey = getModelKey(selectedModel.provider, selectedModel.modelId);
      const favoriteIndex = favoriteStore.items.findIndex(
        (item) => getModelKey(item.provider, item.modelId) === selectedKey,
      );

      if (favoriteIndex < 0 && favoriteStore.items.length >= config.maxFavoriteModels) {
        ctx.ui.notify(`You can register up to ${config.maxFavoriteModels} favorite models`, "warning");
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

      // Apply optimistically, then roll back if the write fails.
      favoriteStore = { version: 1, items: nextItems };
      selectKeyAfterRebuild(selectedKey);

      favoriteUpdatePending = true;
      try {
        await persistFavoriteModelStore(favoriteStore);
      } catch (error) {
        favoriteStore = previousStore;
        selectKeyAfterRebuild(selectedKey);
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

    function renderEffortSuffix(
      model: Model<Api>,
      requested: ThinkingLevel,
      effective: ThinkingLevel,
    ): string {
      if (!model.reasoning) return theme.fg("dim", " · effort unavailable");

      const label = `${theme.fg("dim", " · effort ")}${theme.fg(thinkingColor(requested), requested)}`;
      if (effective === requested) return label;
      return `${label}${theme.fg("dim", " → ")}${theme.fg(thinkingColor(effective), effective)}`;
    }

    function render(width: number): string[] {
      if (cachedLines && cachedWidth === width) return cachedLines;

      const lines: string[] = [];
      const renderWidth = Math.max(1, width);
      const pushWrappedLine = (line: string) => {
        lines.push(...wrapTextWithAnsi(line, renderWidth));
      };
      const visibleModels = getVisibleModels();
      clampModelIndex();
      const selectedModel = visibleModels[modelIndex]?.model;
      const requestedThinking = THINKING_LEVELS[thinkingIndex];
      const effectiveThinking = selectedModel
        ? clampThinkingLevel(selectedModel, requestedThinking)
        : requestedThinking;

      const title = `Model selector${currentModelKey ? ` · current ${currentModelKey}` : ""}`;
      lines.push(theme.fg("accent", "─".repeat(renderWidth)));
      pushWrappedLine(theme.fg("text", title));
      pushWrappedLine(theme.fg("muted", `Search: ${query || "(type to filter)"}`));
      lines.push("");

      if (visibleModels.length === 0) {
        pushWrappedLine(theme.fg("warning", "No matching models"));
      }

      const windowStart = scrollOffset;
      const windowEnd = Math.min(visibleModels.length, windowStart + config.maxVisibleModels);
      if (visibleModels.length > config.maxVisibleModels) {
        pushWrappedLine(
          theme.fg("muted", `Showing ${windowStart + 1}-${windowEnd} of ${visibleModels.length}`),
        );
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
          pushWrappedLine(theme.fg("muted", groupLabel));
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
        const label = `${theme.fg(labelColor, baseLabel)}${effortSuffix}`;
        const prefixWidth = visibleWidth(prefix);
        if (prefixWidth >= renderWidth) {
          pushWrappedLine(`${prefix}${label}`);
        } else {
          const wrapped = wrapTextWithAnsi(label, renderWidth - prefixWidth);
          for (const line of wrapped) {
            lines.push(`${prefix}${line}`);
          }
        }
      }

      lines.push("");
      if (selectedModel && !selectedModel.reasoning) {
        pushWrappedLine(
          theme.fg("warning", "* This model does not support reasoning; effort selection is disabled."),
        );
      }
      pushWrappedLine(
        theme.fg(
          "dim",
          "Type to search • Space favorite • Backspace delete • ↑↓ model • ←→ effort • Enter apply • Esc clear/cancel",
        ),
      );
      lines.push(theme.fg("accent", "─".repeat(renderWidth)));

      cachedWidth = width;
      cachedLines = lines;
      return lines;
    }

    return {
      render,
      invalidate: clearRenderCache,
      handleInput,
    };
  });
}
