/**
 * Session-scoped TTL cache for evaluation decisions, keyed by the trimmed raw
 * user input. Caching by the raw text keeps restored inline code correct even
 * when different inputs mask to the same natural-language text. A cached null
 * is a real "no feedback needed" decision, distinct from a cache miss.
 */

const MAX_ENTRIES = 50;

export const DEFAULT_FEEDBACK_CACHE_TTL_MS = 5 * 60_000;

export class FeedbackCache {
  private readonly entries = new Map<string, { value: string | null; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_FEEDBACK_CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** Returns the cached value, or undefined on a miss (null is a valid value). */
  get(key: string, now: number = Date.now()): string | null | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: string | null, now: number = Date.now()): void {
    this.prune(now);

    if (this.entries.size >= MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }

    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}