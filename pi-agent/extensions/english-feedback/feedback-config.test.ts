import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseModelRef, resolveConfiguredModel } from "./feedback-config.ts";

describe("parseModelRef", () => {
  test("splits on the first slash and keeps the rest of the model id", () => {
    assert.deepEqual(parseModelRef("anthropic/claude-haiku-4"), {
      provider: "anthropic",
      modelId: "claude-haiku-4",
    });
    assert.deepEqual(parseModelRef("together/deepseek-ai/DeepSeek-V4-Flash-0731"), {
      provider: "together",
      modelId: "deepseek-ai/DeepSeek-V4-Flash-0731",
    });
  });

  test("rejects references without a usable provider or model id", () => {
    assert.equal(parseModelRef("claude-haiku-4"), undefined);
    assert.equal(parseModelRef("/claude-haiku-4"), undefined);
    assert.equal(parseModelRef("anthropic/"), undefined);
    assert.equal(parseModelRef(""), undefined);
  });
});

describe("resolveConfiguredModel", () => {
  const fallback = { id: "active-model" };
  const configured = parseModelRef("ollama/gemma4:e4b");

  function registry(resolvable: boolean, authed: boolean) {
    return {
      find: () => (resolvable ? { id: "gemma4:e4b" } : undefined),
      hasConfiguredAuth: () => authed,
    };
  }

  test("uses the configured model when resolvable and authenticated", () => {
    const { model, problem } = resolveConfiguredModel(registry(true, true), configured, fallback);
    assert.deepEqual(model, { id: "gemma4:e4b" });
    assert.equal(problem, undefined);
  });

  test("falls back with a problem when the ref is unknown", () => {
    const { model, problem } = resolveConfiguredModel(registry(false, true), configured, fallback);
    assert.equal(model, fallback);
    assert.match(problem ?? "", /not found/);
  });

  test("falls back with a problem when authentication is missing", () => {
    const { model, problem } = resolveConfiguredModel(registry(true, false), configured, fallback);
    assert.equal(model, fallback);
    assert.match(problem ?? "", /authentication/);
  });

  test("uses the active model without a problem when nothing is configured", () => {
    const { model, problem } = resolveConfiguredModel(registry(true, true), undefined, fallback);
    assert.equal(model, fallback);
    assert.equal(problem, undefined);
  });
});