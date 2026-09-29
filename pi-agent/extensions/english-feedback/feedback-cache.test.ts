import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FeedbackCache } from "./feedback-cache.ts";

describe("FeedbackCache", () => {
  test("distinguishes misses from cached null decisions", () => {
    const cache = new FeedbackCache(60_000);
    assert.equal(cache.get("same input"), undefined);

    cache.set("same input", null);
    assert.equal(cache.get("same input"), null);

    cache.set("other input", "Please check this function.");
    assert.equal(cache.get("other input"), "Please check this function.");
  });

  test("expires entries after the TTL", () => {
    const cache = new FeedbackCache(1_000);
    cache.set("key", "value", 1_000);

    assert.equal(cache.get("key", 1_999), "value");
    assert.equal(cache.get("key", 2_000), undefined);
    assert.equal(cache.get("key", 3_000), undefined);
  });

  test("evicts the oldest entry beyond the cap", () => {
    const cache = new FeedbackCache(60_000);
    for (let index = 0; index < 50; index++) {
      cache.set(`key-${index}`, "value", index + 1);
    }
    cache.set("key-50", "value", 100);

    assert.equal(cache.get("key-0", 100), undefined);
    assert.equal(cache.get("key-1", 100), "value");
    assert.equal(cache.get("key-50", 100), "value");
  });

  test("clear drops every entry", () => {
    const cache = new FeedbackCache(60_000);
    cache.set("key", "value");
    cache.clear();

    assert.equal(cache.get("key"), undefined);
  });
});