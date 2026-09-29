import {
  clampThinkingLevel,
  contentText,
  type Api,
  type Model,
} from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { extractCompleteJsonObject, FEEDBACK_SYSTEM_PROMPT } from "./feedback-policy.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_TOKENS = 256;

export async function evaluateFeedback(
  modelRegistry: ModelRegistry,
  model: Model<Api>,
  modelInput: string,
  upstreamSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  const timeout = setTimeout(
    () => controller.abort(new Error("English feedback request timed out")),
    REQUEST_TIMEOUT_MS,
  );
  timeout.unref?.();

  if (upstreamSignal?.aborted) {
    abortFromUpstream();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  }

  try {
    const lowestReasoningLevel = clampThinkingLevel(model, "off");
    const stream = modelRegistry.streamSimple(
      model,
      {
        systemPrompt: FEEDBACK_SYSTEM_PROMPT,
        messages: [{ role: "user", content: modelInput, timestamp: Date.now() }],
      },
      {
        signal: controller.signal,
        reasoning: lowestReasoningLevel === "off" ? undefined : lowestReasoningLevel,
        maxTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      },
    );

    // The response is a single small JSON object, so the stream is aborted as
    // soon as that object is complete instead of waiting for finalization.
    let bufferedText = "";
    let extracted: string | undefined;
    try {
      for await (const event of stream) {
        if (event.type !== "text_delta") continue;
        bufferedText += event.delta;
        const object = extractCompleteJsonObject(bufferedText);
        if (object !== null) {
          extracted = object;
          controller.abort(new Error("English feedback JSON completed"));
          break;
        }
      }
    } catch {
      // The abort above can surface as a stream error; the buffer stays
      // authoritative when it already holds a complete object.
    }
    if (extracted !== undefined) {
      return extracted;
    }

    const result = await stream.result();
    if (result.stopReason === "error" || result.stopReason === "aborted") {
      throw new Error(result.errorMessage ?? `English feedback request ${result.stopReason}`);
    }

    return contentText(result.content);
  } finally {
    clearTimeout(timeout);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}
