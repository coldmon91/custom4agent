import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import { loadConfig } from "../src/config";
import { persistDefaultModel, persistModelThinkingLevel } from "../src/global-settings";
import { getSelectableModelData } from "../src/model-list";
import { loadFavoriteModelStore, recordRecentModel } from "../src/model-stores";
import { getModelKey, normalizeThinkingLevel, THINKING_LEVELS } from "../src/models";
import { showModelSelector } from "../src/selector-view";

/** Registering an unknown key spec must not take the whole extension down. */
function registerShortcut(
  pi: ExtensionAPI,
  shortcut: KeyId,
  handler: Parameters<ExtensionAPI["registerShortcut"]>[1],
): void {
  try {
    pi.registerShortcut(shortcut, handler);
  } catch (error) {
    console.error(`model-thinking-selector: failed to register shortcut "${shortcut}":`, error);
  }
}

export default function modelThinkingSelector(pi: ExtensionAPI) {
  const config = loadConfig();

  pi.on("model_select", async (event) => {
    await Promise.all([
      recordRecentModel(event.model.provider, event.model.id, config.maxRecentModels),
      config.persistDefaultModel
        ? persistDefaultModel(event.model.provider, event.model.id)
        : Promise.resolve(),
    ]);
  });

  // Fires after model_select, so the effort chosen in the selector wins over the
  // level pi derives while switching models.
  pi.on("thinking_level_select", async (event, ctx) => {
    if (!config.persistThinkingLevel || !ctx.model) return;
    await persistModelThinkingLevel(ctx.model.provider, ctx.model.id, event.level);
  });

  registerShortcut(pi, config.cycleThinkingShortcut, {
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

  registerShortcut(pi, config.selectorShortcut, {
    description: "Select model and thinking level",
    handler: async (ctx) => {
      const [modelData, favoriteStore] = await Promise.all([
        getSelectableModelData(ctx, config.maxRecentModels),
        loadFavoriteModelStore(config.maxFavoriteModels),
      ]);

      const result = await showModelSelector({
        ctx,
        config,
        modelData,
        favoriteStore,
        currentThinking: pi.getThinkingLevel(),
      });
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
