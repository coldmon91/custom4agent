import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { loadRecentModelStore } from "./model-stores";
import {
  getModelKey,
  type FavoriteModelStore,
  type ModelItem,
  type SelectableModelData,
} from "./models";

/** The active model always leads the recent list, even before it is written to disk. */
async function getRecentModelKeys(ctx: ExtensionContext, limit: number): Promise<string[]> {
  const store = await loadRecentModelStore(limit);
  const keys = [
    ...(ctx.model ? [getModelKey(ctx.model.provider, ctx.model.id)] : []),
    ...store.items.map((item) => getModelKey(item.provider, item.modelId)),
  ];

  return [...new Set(keys)].slice(0, limit);
}

export async function getSelectableModelData(
  ctx: ExtensionContext,
  recentLimit: number,
): Promise<SelectableModelData> {
  const catalogModels = [...ctx.modelRegistry.getAll()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id),
  );
  const availableModels = catalogModels.filter((model) =>
    ctx.modelRegistry.hasConfiguredAuth(model),
  );

  return {
    catalogModels,
    availableModels,
    recentKeys: await getRecentModelKeys(ctx, recentLimit),
  };
}

/** Order the list as favorites, then recents, then everything else, with no model repeated. */
export function buildSelectableModels(
  data: SelectableModelData,
  favoriteStore: FavoriteModelStore,
): ModelItem[] {
  const catalogByKey = new Map(
    data.catalogModels.map((model) => [getModelKey(model.provider, model.id), model] as const),
  );
  const availableByKey = new Map(
    data.availableModels.map((model) => [getModelKey(model.provider, model.id), model] as const),
  );
  const favoriteKeys = favoriteStore.items.map((item) => getModelKey(item.provider, item.modelId));
  const favoriteSet = new Set(favoriteKeys);
  const recentKeys = data.recentKeys.filter((key) => !favoriteSet.has(key));
  const recentSet = new Set(recentKeys);

  const toAvailableItem = (
    model: Model<Api>,
    isFavorite: boolean,
    isRecent: boolean,
  ): ModelItem => ({
    provider: model.provider,
    modelId: model.id,
    model,
    isAvailable: true,
    isFavorite,
    isRecent,
  });

  const favoriteItems: ModelItem[] = favoriteStore.items.map((entry) => {
    const key = getModelKey(entry.provider, entry.modelId);
    const availableModel = availableByKey.get(key);
    if (availableModel) return toAvailableItem(availableModel, true, false);

    return {
      provider: entry.provider,
      modelId: entry.modelId,
      model: catalogByKey.get(key),
      isAvailable: false,
      isFavorite: true,
      isRecent: false,
    };
  });

  const pickAvailable = (keys: string[], isRecent: boolean): ModelItem[] =>
    keys
      .map((key) => availableByKey.get(key))
      .filter((model): model is Model<Api> => Boolean(model))
      .map((model) => toAvailableItem(model, false, isRecent));

  return [
    ...favoriteItems,
    ...pickAvailable(recentKeys, true),
    ...data.availableModels
      .filter((model) => {
        const key = getModelKey(model.provider, model.id);
        return !favoriteSet.has(key) && !recentSet.has(key);
      })
      .map((model) => toAvailableItem(model, false, false)),
  ];
}
