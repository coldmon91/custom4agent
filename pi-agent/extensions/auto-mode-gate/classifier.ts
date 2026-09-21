/**
 * Runs the pending action past a classifier model and parses its verdict.
 *
 * This runs on every non-read-only call, so its latency is felt on every turn.
 * `ctx.model` is the last resort so the gate still functions when none of the
 * preferred models is authenticated.
 */

import type { Api, Model, UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getClassifierConfig } from "./classifier-config.ts";
import type { ClassifierResult, ClassifierVerdict } from "./types.ts";

// The model chain, reasoning level and timeout live in classifier-config.json
// so they can be changed without touching code. See that file's notes for the
// measured accuracy behind the default ordering.

const VERDICTS: ReadonlySet<string> = new Set(["allow", "soft_deny", "hard_deny"]);

export class ClassifierUnavailableError extends Error {}

/**
 * Set by `/automode model <provider/id>`. This outranks the configured chain
 * for the rest of the process but is not written to disk — edit
 * classifier-config.json for a change that survives a restart.
 */
let pinnedModel: { provider: string; modelId: string } | undefined;

export function pinClassifierModel(provider: string, modelId: string): void {
  pinnedModel = { provider, modelId };
}

export function resolveClassifierModel(ctx: ExtensionContext): Model<Api> | undefined {
  const configured = getClassifierConfig().models;
  const candidates = pinnedModel ? [pinnedModel, ...configured] : configured;

  for (const candidate of candidates) {
    const model = ctx.modelRegistry.find(candidate.provider, candidate.modelId);
    if (model && ctx.modelRegistry.hasConfiguredAuth(model)) return model;
  }

  return ctx.model;
}

function assistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";

  return content
    .filter((part): part is { type: "text"; text: string } => {
      const candidate = part as { type?: string; text?: unknown };
      return candidate.type === "text" && typeof candidate.text === "string";
    })
    .map((part) => part.text)
    .join("\n");
}

/** Pulls the verdict object out of a reply that may carry a fence or prose. */
export function parseVerdict(reply: string): ClassifierResult {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ClassifierUnavailableError(`classifier reply was not JSON: ${reply.slice(0, 200)}`);
  }

  const parsed = JSON.parse(reply.slice(start, end + 1)) as {
    verdict?: unknown;
    rule?: unknown;
    rationale?: unknown;
  };

  if (typeof parsed.verdict !== "string" || !VERDICTS.has(parsed.verdict)) {
    throw new ClassifierUnavailableError(`classifier returned no usable verdict: ${reply.slice(0, 200)}`);
  }

  return {
    verdict: parsed.verdict as ClassifierVerdict,
    rule: typeof parsed.rule === "string" && parsed.rule.length > 0 ? parsed.rule : "unnamed rule",
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

export async function classify(
  ctx: ExtensionContext,
  systemPrompt: string,
  request: string,
): Promise<ClassifierResult> {
  const model = resolveClassifierModel(ctx);
  if (!model) throw new ClassifierUnavailableError("no classifier model is available");

  const message: UserMessage = {
    role: "user",
    content: [{ type: "text", text: request }],
    timestamp: Date.now(),
  };

  // No `temperature`: openai-codex rejects the parameter outright, and a
  // rejected call degrades the whole gate to its unavailable-fallback.
  const { reasoning, timeoutMs } = getClassifierConfig();
  const response = await ctx.modelRegistry.complete(
    model,
    { systemPrompt, messages: [message] },
    { signal: ctx.signal, timeoutMs, reasoning },
  );

  if (response.stopReason === "aborted") {
    throw new ClassifierUnavailableError("classifier call was aborted");
  }
  if (response.stopReason === "error") {
    throw new ClassifierUnavailableError(response.errorMessage ?? "classifier call failed");
  }

  return parseVerdict(assistantText(response.content));
}
