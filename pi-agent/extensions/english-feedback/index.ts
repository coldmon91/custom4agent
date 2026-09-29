import { contentText } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { FeedbackCache } from "./feedback-cache.ts";
import { getFeedbackConfig, resolveConfiguredModel } from "./feedback-config.ts";
import { evaluateFeedback } from "./feedback-evaluator.ts";
import {
  parseFeedbackDecision,
  prepareFeedbackInput,
} from "./feedback-policy.ts";
import {
  ENGLISH_FEEDBACK_ENTRY_TYPE,
  type EnglishFeedbackEntry,
  registerFeedbackRenderer,
} from "./feedback-renderer.ts";

const PENDING_FEEDBACK_TTL_MS = 60_000;
const FEEDBACK_CACHE_TTL_MS = 5 * 60_000;

interface PendingFeedback {
  input: string;
  text: string;
  expiresAt: number;
}

type WarnableContext = {
  modelRegistry: ModelRegistry;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
};

function warnOnce(
  warned: Set<string>,
  ctx: WarnableContext,
  key: string,
  message: string,
): void {
  if (warned.has(key)) return;
  warned.add(key);
  ctx.ui.notify(message, "warning");
}

function resolveFeedbackModel(
  warned: Set<string>,
  ctx: WarnableContext,
  fallback: Model<Api>,
): Model<Api> {
  const config = getFeedbackConfig();
  if (config.problem) {
    warnOnce(warned, ctx, config.problem, `english-feedback: ${config.problem}`);
  }

  const { model, problem } = resolveConfiguredModel(ctx.modelRegistry, config.model, fallback);
  if (problem) {
    warnOnce(warned, ctx, problem, `english-feedback: ${problem}`);
  }
  return model;
}

export default function englishFeedback(pi: ExtensionAPI): void {
  let pendingFeedback: PendingFeedback[] = [];
  const feedbackCache = new FeedbackCache(FEEDBACK_CACHE_TTL_MS);
  const warnedNotifications = new Set<string>();

  const discardExpiredFeedback = (): void => {
    const now = Date.now();
    pendingFeedback = pendingFeedback.filter((item) => item.expiresAt > now);
  };

  registerFeedbackRenderer(pi);

  pi.on("session_start", () => {
    pendingFeedback = [];
    feedbackCache.clear();
  });

  pi.on("input", async (event, ctx) => {
    const trimmedInput = event.text.trimStart();
    if (
      ctx.mode !== "tui"
      || event.source === "extension"
      || trimmedInput.startsWith("/")
      || trimmedInput.startsWith("!")
      || !ctx.model
    ) {
      return { action: "continue" };
    }

    const prepared = prepareFeedbackInput(event.text);
    if (!prepared) {
      return { action: "continue" };
    }

    // Identical resubmissions skip the evaluator entirely.
    const cacheKey = event.text.trim();
    const cachedFeedback = feedbackCache.get(cacheKey);
    if (cachedFeedback !== undefined) {
      if (cachedFeedback !== null) {
        discardExpiredFeedback();
        pendingFeedback.push({
          input: event.text,
          text: cachedFeedback,
          expiresAt: Date.now() + PENDING_FEEDBACK_TTL_MS,
        });
      }
      return { action: "continue" };
    }

    try {
      const model = resolveFeedbackModel(warnedNotifications, ctx, ctx.model);
      const startedAt = Date.now();
      const responseText = await evaluateFeedback(
        ctx.modelRegistry,
        model,
        prepared.modelInput,
        ctx.signal,
      );
      const elapsedMs = Date.now() - startedAt;
      const decision = parseFeedbackDecision(responseText, prepared.placeholders);
      // Cache hits stay silent, so this reports every real evaluator call.
      const outcome = decision.kind === "feedback"
        ? "feedback"
        : decision.kind === "none"
          ? "no feedback"
          : "invalid response";
      ctx.ui.notify(`english-feedback: evaluated in ${elapsedMs} ms (${outcome})`, "info");
      // Malformed responses are not cached so a later attempt can still work.
      if (decision.kind !== "invalid") {
        feedbackCache.set(cacheKey, decision.kind === "feedback" ? decision.text : null);
      }
      if (decision.kind === "feedback") {
        discardExpiredFeedback();
        pendingFeedback.push({
          input: event.text,
          text: decision.text,
          expiresAt: Date.now() + PENDING_FEEDBACK_TTL_MS,
        });
      }
    } catch (error) {
      // English feedback must never block the user's original request, but the
      // user should learn once why the configured model is unavailable.
      const detail = error instanceof Error ? error.message : String(error);
      warnOnce(warnedNotifications, ctx, detail, `english-feedback: evaluation failed, feedback skipped (${detail})`);
    }

    return { action: "continue" };
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "user") {
      return;
    }

    discardExpiredFeedback();
    const input = contentText(event.message.content);
    const matchedFeedback: string[] = [];
    while (true) {
      const pendingIndex = pendingFeedback.findIndex((item) => item.input === input);
      if (pendingIndex < 0) break;
      const [item] = pendingFeedback.splice(pendingIndex, 1);
      matchedFeedback.push(item.text);
    }
    if (matchedFeedback.length === 0) {
      return;
    }

    // Extension handlers run before the session persists this user message, so
    // the entry append is deferred by one macrotask to keep the feedback right
    // below it in the transcript instead of above it.
    setTimeout(() => {
      for (const text of matchedFeedback) {
        pi.appendEntry<EnglishFeedbackEntry>(ENGLISH_FEEDBACK_ENTRY_TYPE, {
          text,
        });
      }
    }, 0);
  });
}
