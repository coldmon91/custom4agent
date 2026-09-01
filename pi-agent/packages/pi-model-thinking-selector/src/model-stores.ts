import { readJsonFile, readString, writeJsonFile } from "./json-store";
import {
  getModelKey,
  type FavoriteModelEntry,
  type FavoriteModelStore,
  type RecentModelEntry,
  type RecentModelStore,
} from "./models";

export const FAVORITE_MODELS_FILE = "favorite-models.json";
export const RECENT_MODELS_FILE = "recent-models.json";

// Both stores live in the shared agent dir, so serialize writes inside this
// process to avoid one save clobbering another.
let favoriteWriteQueue: Promise<void> = Promise.resolve();
let recentWriteQueue: Promise<void> = Promise.resolve();

/** Accepts both a bare array and the versioned object form, dropping duplicates and junk entries. */
function normalizeEntries<T>(
  data: unknown,
  limit: number,
  build: (provider: string, modelId: string, item: object) => T,
): T[] {
  const rawItems: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { items?: unknown } | null)?.items)
      ? (data as { items: unknown[] }).items
      : [];

  const items: T[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const provider = readString(item, "provider");
    const modelId = readString(item, "modelId");
    if (!provider || !modelId) continue;

    const key = getModelKey(provider, modelId);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(build(provider, modelId, item));
    if (items.length >= limit) break;
  }

  return items;
}

const EPOCH = new Date(0).toISOString();

export function normalizeFavoriteModelStore(data: unknown, limit: number): FavoriteModelStore {
  return {
    version: 1,
    items: normalizeEntries<FavoriteModelEntry>(data, limit, (provider, modelId, item) => ({
      provider,
      modelId,
      addedAt: readString(item, "addedAt") ?? EPOCH,
    })),
  };
}

export function normalizeRecentModelStore(data: unknown, limit: number): RecentModelStore {
  return {
    version: 1,
    items: normalizeEntries<RecentModelEntry>(data, limit, (provider, modelId, item) => ({
      provider,
      modelId,
      lastUsedAt: readString(item, "lastUsedAt") ?? EPOCH,
    })),
  };
}

export async function loadFavoriteModelStore(limit: number): Promise<FavoriteModelStore> {
  return normalizeFavoriteModelStore(await readJsonFile(FAVORITE_MODELS_FILE), limit);
}

export async function loadRecentModelStore(limit: number): Promise<RecentModelStore> {
  return normalizeRecentModelStore(await readJsonFile(RECENT_MODELS_FILE), limit);
}

/** Snapshots the store so a later in-memory rollback cannot alter what gets written. */
export function persistFavoriteModelStore(store: FavoriteModelStore): Promise<void> {
  const snapshot: FavoriteModelStore = {
    version: 1,
    items: store.items.map((item) => ({ ...item })),
  };

  favoriteWriteQueue = favoriteWriteQueue
    .catch(() => undefined)
    .then(() => writeJsonFile(FAVORITE_MODELS_FILE, snapshot));

  return favoriteWriteQueue;
}

export function recordRecentModel(provider: string, modelId: string, limit: number): Promise<void> {
  const key = getModelKey(provider, modelId);

  recentWriteQueue = recentWriteQueue
    .then(async () => {
      const store = await loadRecentModelStore(limit);
      const items = [
        { provider, modelId, lastUsedAt: new Date().toISOString() },
        ...store.items.filter((item) => getModelKey(item.provider, item.modelId) !== key),
      ].slice(0, limit);
      await writeJsonFile(RECENT_MODELS_FILE, { version: 1, items });
    })
    .catch((error) => {
      console.error(`Failed to update ${RECENT_MODELS_FILE}:`, error);
    });

  return recentWriteQueue;
}
