import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { ProgressState } from "./progress-state.ts";
import { WorkingGoal } from "./working-goal.ts";
import { addWorkingGoalGuideline } from "./working-goal-prompt.ts";
import { workingGoalWidget } from "./working-goal-widget.ts";

const GOAL_WIDGET_KEY = "progress-status-goal";

export default function progressStatus(pi: ExtensionAPI) {
  const state = new ProgressState();
  const goal = new WorkingGoal();
  let ui: Pick<ExtensionUIContext, "setWorkingMessage" | "setWidget"> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let signal: AbortSignal | undefined;
  let lastMessage: string | undefined;
  let lastGoal: string | undefined;

  function render() {
    if (!ui) return;
    const message = state.format(performance.now());
    if (message !== lastMessage) {
      ui.setWorkingMessage(message);
      lastMessage = message;
    }
    const purpose = goal.format();
    if (purpose !== lastGoal) {
      ui.setWidget(GOAL_WIDGET_KEY, () => workingGoalWidget(purpose));
      lastGoal = purpose;
    }
  }

  function stop() {
    if (!ui) return;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    signal?.removeEventListener("abort", stop);
    signal = undefined;
    state.stop();
    goal.reset();
    ui.setWorkingMessage();
    ui.setWidget(GOAL_WIDGET_KEY, undefined);
    ui = undefined;
    lastMessage = undefined;
    lastGoal = undefined;
  }

  function start(ctx: ExtensionContext, phase = "Waiting for model") {
    if (ctx.mode !== "tui" || ctx.signal?.aborted || ui) return;
    ui = ctx.ui;
    goal.reset();
    state.start(performance.now(), phase);
    signal = ctx.signal;
    signal?.addEventListener("abort", stop, { once: true });
    timer = setInterval(render, 1000);
    timer.unref?.();
    render();
  }

  function update(change: (now: number) => void) {
    if (!ui) return;
    change(performance.now());
    render();
  }

  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.mode === "tui") addWorkingGoalGuideline(event);
  });

  pi.on("session_start", (_event, ctx) => {
    stop();
    if (ctx.mode === "tui" && !ctx.isIdle()) start(ctx, "Syncing task state");
  });
  pi.on("session_shutdown", stop);
  pi.on("agent_start", (_event, ctx) => start(ctx));
  pi.on("agent_end", stop);
  pi.on("agent_settled", stop);

  pi.on("turn_start", (_event, ctx) => {
    start(ctx);
    update((now) => state.modelPhase("Waiting for model", now));
  });
  pi.on("before_provider_request", () => {
    update((now) => state.modelPhase("Waiting for model", now));
  });
  pi.on("after_provider_response", () => update((now) => state.observe(now)));
  pi.on("provider_stream_event", () => update((now) => state.observe(now)));

  pi.on("message_start", (event) => {
    if (ui && event.message.role === "assistant") goal.beginMessage();
  });
  pi.on("message_update", (event) => {
    if (event.message.role !== "assistant") return;
    const streamEvent = event.assistantMessageEvent;
    const type = streamEvent.type;
    update((now) => {
      if (type === "thinking_start" || type === "thinking_delta") {
        state.modelPhase("Thinking", now);
      } else if (streamEvent.type === "text_start" || streamEvent.type === "text_delta") {
        state.modelPhase("Streaming response", now);
        if (streamEvent.type === "text_delta") goal.append(streamEvent.delta);
      } else if (streamEvent.type === "text_end") {
        state.observe(now);
        goal.finishText(streamEvent.content);
      } else if (type === "toolcall_start" || type === "toolcall_delta") {
        state.modelPhase("Preparing tool call", now);
      } else {
        state.observe(now);
      }
    });
  });
  pi.on("message_end", (event) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason === "aborted") {
      stop();
      return;
    }
    const phase = message.stopReason === "error"
      ? "Response error · follow-up"
      : message.content.some((part) => part.type === "toolCall")
        ? "Preparing tools"
        : "Finishing response";
    update((now) => {
      const text = message.content.find((part) => part.type === "text");
      if (text?.type === "text") goal.finishText(text.text);
      state.modelPhase(phase, now);
    });
  });

  pi.on("tool_execution_start", (event) => {
    update((now) => state.startTool(event.toolCallId, event.toolName, now));
  });
  pi.on("tool_execution_update", () => update((now) => state.observe(now)));
  pi.on("tool_execution_end", (event) => {
    update((now) => state.endTool(event.toolCallId, event.isError, now));
  });
  pi.on("ui_prompt_start", (event) => {
    update((now) => state.startPrompt(event.kind, now));
  });
  pi.on("ui_prompt_end", () => update((now) => state.endPrompt(now)));
}
