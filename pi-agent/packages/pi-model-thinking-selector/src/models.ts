import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai/compat";

/** Global thinking scale, ordered from lowest to highest effort. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = ModelThinkingLevel;

export type FavoriteModelEntry = {
  provider: string;
  modelId: string;
  addedAt: string;
};

export type FavoriteModelStore = {
  version: 1;
  items: FavoriteModelEntry[];
};

export type RecentModelEntry = {
  provider: string;
  modelId: string;
  lastUsedAt: string;
};

export type RecentModelStore = {
  version: 1;
  items: RecentModelEntry[];
};

type ModelItemBase = {
  provider: string;
  modelId: string;
  isFavorite: boolean;
  isRecent: boolean;
};

export type AvailableModelItem = ModelItemBase & {
  model: Model<Api>;
  isAvailable: true;
};

export type UnavailableModelItem = ModelItemBase & {
  model: Model<Api> | undefined;
  isAvailable: false;
};

export type ModelItem = AvailableModelItem | UnavailableModelItem;

export type SelectableModelData = {
  catalogModels: Model<Api>[];
  availableModels: Model<Api>[];
  recentKeys: string[];
};

export function getModelKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

export function formatModelLabel(model: Model<Api>): string {
  const reasoning = model.reasoning ? "reasoning" : "no-reasoning";
  return `${model.provider}/${model.id} — ${model.name} [${reasoning}]`;
}

export function normalizeThinkingLevel(level: string): ThinkingLevel {
  return THINKING_LEVELS.includes(level as ThinkingLevel) ? (level as ThinkingLevel) : "off";
}
