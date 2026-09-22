import { contentText } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { evaluateFeedback } from "./feedback-evaluator";
import {
  parseFeedbackResponse,
  prepareFeedbackInput,
} from "./feedback-policy";
import {
  ENGLISH_FEEDBACK_ENTRY_TYPE,
  type EnglishFeedbackEntry,
  registerFeedbackRenderer,
} from "./feedback-renderer";

const PENDING_FEEDBACK_TTL_MS = 60_000;

interface PendingFeedback {
  input: string;
  text: string;
  expiresAt: number;
}

export default function englishFeedback(pi: ExtensionAPI): void {
  let pendingFeedback: PendingFeedback[] = [];
  let readyFeedback: string[] = [];

  const discardExpiredFeedback = (): void => {
    const now = Date.now();
    pendingFeedback = pendingFeedback.filter((item) => item.expiresAt > now);
  };

  registerFeedbackRenderer(pi);

  pi.on("session_start", () => {
    pendingFeedback = [];
    readyFeedback = [];
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

    try {
      const responseText = await evaluateFeedback(
        ctx.modelRegistry,
        ctx.model,
        prepared.modelInput,
        ctx.signal,
      );
      const feedback = parseFeedbackResponse(responseText, prepared.placeholders);
      if (feedback) {
        discardExpiredFeedback();
        pendingFeedback.push({
          input: event.text,
          text: feedback,
          expiresAt: Date.now() + PENDING_FEEDBACK_TTL_MS,
        });
      }
    } catch {
      // English feedback must never block the user's original request.
    }

    return { action: "continue" };
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "user") {
      return;
    }

    discardExpiredFeedback();
    const input = contentText(event.message.content);
    const pendingIndex = pendingFeedback.findIndex((item) => item.input === input);
    if (pendingIndex < 0) {
      return;
    }

    const [matchedFeedback] = pendingFeedback.splice(pendingIndex, 1);
    readyFeedback.push(matchedFeedback.text);
  });

  pi.on("turn_start", () => {
    const feedback = readyFeedback.shift();
    if (!feedback) {
      return;
    }

    pi.appendEntry<EnglishFeedbackEntry>(ENGLISH_FEEDBACK_ENTRY_TYPE, {
      text: feedback,
    });
  });
}
