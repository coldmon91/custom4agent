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
  const allModels = ctx.modelRegistry
    .getAll()
    .filter((model) => ctx.modelRegistry.hasConfiguredAuth(model))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));

  return { allModels, recentKeys: await getRecentModelKeys(ctx, recentLimit) };
}

/** Order the list as favorites, then recents, then everything else, with no model repeated. */
export function buildSelectableModels(
  data: SelectableModelData,
  favoriteStore: FavoriteModelStore,
): ModelItem[] {
  const byKey = new Map(
    data.allModels.map((model) => [getModelKey(model.provider, model.id), model] as const),
  );
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

  const pick = (keys: string[], isFavorite: boolean, isRecent: boolean): ModelItem[] =>
    keys
      .map((key) => byKey.get(key))
      .filter((model): model is Model<Api> => Boolean(model))
      .map((model) => toItem(model, isFavorite, isRecent));

  return [
    ...pick(favoriteKeys, true, false),
    ...pick(recentKeys, false, true),
    ...data.allModels
      .filter((model) => {
        const key = getModelKey(model.provider, model.id);
        return !favoriteSet.has(key) && !recentSet.has(key);
      })
      .map((model) => toItem(model, false, false)),
  ];
}
