import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import progressStatus from "./index.ts";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;

function harness(t: TestContext, mode = "tui", idle = true) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const scheduled = t.mock.method(globalThis, "setInterval");
  const cleared = t.mock.method(globalThis, "clearInterval");
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const messages: Array<string | undefined> = [];
  const widgets: Array<{ key: string; content: (() => { render(width: number): string[] }) | undefined }> = [];
  const handlers = new Map<string, Handler>();
  const controller = new AbortController();
  const ctx = {
    mode,
    isIdle: () => idle,
    signal: controller.signal,
    ui: {
      setWorkingMessage: (message?: string) => messages.push(message),
      setWidget: (key: string, content?: () => { render(width: number): string[] }) => widgets.push({ key, content }),
    },
  } as unknown as ExtensionContext;
  progressStatus({ on: (name: string, handler: Handler) => handlers.set(name, handler) } as never);
  const emit = (type: string, data: Record<string, unknown> = {}) => handlers.get(type)?.({ type, ...data }, ctx);
  t.after(() => emit("session_shutdown"));
  return {
    ctx, emit, messages, widgets, scheduled, cleared, controller,
    last: () => messages.at(-1),
    goal: (width = 120) => widgets.at(-1)?.content?.().render(width)[0],
    advance(ms: number) { now += ms; t.mock.timers.tick(ms); },
  };
}

function streamText(h: ReturnType<typeof harness>, text: string): void {
  const message = { role: "assistant", content: [{ type: "text", text }] };
  h.emit("message_start", { message });
  h.emit("message_update", {
    message,
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: text },
  });
  h.emit("message_update", {
    message,
    assistantMessageEvent: { type: "text_end", contentIndex: 0, content: text },
  });
}

test("the factory starts no timers; active runs show elapsed time and event age", (t) => {
  const h = harness(t);
  assert.equal(h.scheduled.mock.callCount(), 0);
  h.emit("agent_start");
  h.emit("turn_start");
  assert.equal(h.scheduled.mock.callCount(), 1);
  h.advance(5000);
  assert.equal(h.last(), "Waiting for model · 5s · last event 5s ago");
  h.emit("turn_start");
  h.advance(2000);
  assert.equal(h.last(), "Waiting for model · 7s · last event 2s ago");
});

test("empty thinking events are visible, and token events do not flood the UI", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  const event = {
    message: { role: "assistant", content: [{ type: "thinking", thinking: "" }] },
    assistantMessageEvent: { type: "thinking_start" },
  };
  const original = structuredClone(event);
  h.emit("message_update", event);
  assert.match(h.last()!, /^Thinking/);
  const count = h.messages.length;
  for (let i = 0; i < 100; i++) h.emit("provider_stream_event", { data: { private: "not rendered" } });
  assert.equal(h.messages.length, count);
  assert.deepEqual(event, original);
  h.advance(1000);
  assert.match(h.last()!, /last event 1s ago/);
});

test("parallel tools, approval prompts, failures, and the next turn update the stage", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  h.emit("tool_execution_start", { toolCallId: "one", toolName: "bash", args: { command: "SECRET" } });
  h.emit("tool_execution_start", { toolCallId: "two", toolName: "read" });
  h.emit("ui_prompt_start", { kind: "confirm", title: "SECRET" });
  assert.match(h.last()!, /^Waiting for approval/);
  h.emit("before_provider_request", { payload: { secret: "SECRET" } });
  assert.match(h.last()!, /^Waiting for approval/);
  h.emit("ui_prompt_end");
  h.emit("tool_execution_end", { toolCallId: "two", isError: false });
  assert.match(h.last()!, /^bash: processing/);
  h.emit("tool_execution_end", { toolCallId: "one", isError: true });
  assert.match(h.last()!, /^bash: failed · follow-up/);
  h.emit("turn_start");
  assert.match(h.last()!, /^Waiting for model/);
  assert.ok(h.messages.every(message => !message?.includes("SECRET")));
});

test("text and tool-request streams have separate stages", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  h.emit("message_update", { message: { role: "assistant" }, assistantMessageEvent: { type: "text_delta", delta: "Ordinary response" } });
  assert.match(h.last()!, /^Streaming response/);
  h.emit("message_update", { message: { role: "assistant" }, assistantMessageEvent: { type: "toolcall_start" } });
  assert.match(h.last()!, /^Preparing tool call/);
});

for (const event of ["agent_end", "agent_settled", "session_shutdown"]) {
  test(`${event} clears the timer and restores the default working message`, (t) => {
    const h = harness(t);
    h.emit("agent_start");
    h.emit(event);
    assert.equal(h.last(), undefined);
    assert.equal(h.goal(), undefined);
    assert.equal(h.widgets.at(-1)?.key, "progress-status-goal");
    assert.equal(h.cleared.mock.callCount(), 1);
    const count = h.messages.length;
    const widgetCount = h.widgets.length;
    h.advance(10_000);
    h.emit(event);
    assert.equal(h.messages.length, count);
    assert.equal(h.widgets.length, widgetCount);
    assert.equal(h.cleared.mock.callCount(), 1);
  });
}

test("aborting clears the timer immediately, without waiting for agent_end", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  h.controller.abort();
  assert.equal(h.last(), undefined);
  assert.equal(h.cleared.mock.callCount(), 1);
  h.emit("turn_start");
  assert.equal(h.scheduled.mock.callCount(), 1);
});

test("a reload during active work resumes with an honest unknown-stage label", (t) => {
  const h = harness(t, "tui", false);
  h.emit("session_start");
  assert.match(h.last()!, /^Syncing task state/);
  h.emit("session_start");
  assert.equal(h.cleared.mock.callCount(), 1);
  assert.equal(h.scheduled.mock.callCount(), 2);
});

for (const mode of ["rpc", "json", "print"]) {
  test(`${mode} mode has no UI changes or timers`, (t) => {
    const h = harness(t, mode, false);
    h.emit("session_start");
    h.emit("agent_start");
    h.emit("turn_start");
    h.emit("provider_stream_event");
    h.emit("tool_execution_start", { toolCallId: "one", toolName: "bash" });
    assert.equal(h.scheduled.mock.callCount(), 0);
    assert.deepEqual(h.messages, []);
    assert.deepEqual(h.widgets, []);
    const options = { promptGuidelines: ["Original instructions"] };
    h.emit("before_agent_start", { systemPromptOptions: options });
    h.emit("message_update", {
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta: "Working on: A goal\n" },
    });
    assert.deepEqual(options, { promptGuidelines: ["Original instructions"] });
    assert.deepEqual(h.widgets, []);
  });
}

test("idle sessions create no timers, and cancelled messages stop an active timer", (t) => {
  const h = harness(t);
  h.emit("session_start");
  assert.equal(h.scheduled.mock.callCount(), 0);
  h.emit("agent_start");
  h.emit("message_end", { message: { role: "assistant", stopReason: "aborted" } });
  assert.equal(h.last(), undefined);
  assert.equal(h.cleared.mock.callCount(), 1);
});

test("the previous run's abort signal cannot stop a newer run", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  h.emit("agent_end");
  h.ctx.signal = new AbortController().signal;
  h.emit("agent_start");
  h.controller.abort();
  h.advance(1000);
  assert.match(h.last()!, /^Waiting for model · 1s/);
  assert.equal(h.cleared.mock.callCount(), 1);
});


test("active work shows a neutral goal once, without timer-driven widget updates", (t) => {
  const h = harness(t);
  h.emit("session_start");
  assert.deepEqual(h.widgets, []);
  h.emit("agent_start");
  assert.equal(h.goal(), "Working on: Awaiting task summary");
  assert.equal(h.widgets.length, 1);
  h.advance(5000);
  h.emit("provider_stream_event", { data: { private: "SECRET" } });
  assert.equal(h.widgets.length, 1);
});

test("explicit goals update independently of the clock and progress-stage cache", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  streamText(h, "Working on: Diagnosing missing progress updates\nDetails");
  assert.equal(h.goal(), "Working on: Diagnosing missing progress updates");
  const messageCount = h.messages.length;
  const widgetCount = h.widgets.length;
  streamText(h, "Working on: Verifying regression tests\nDetails");
  assert.equal(h.goal(), "Working on: Verifying regression tests");
  assert.equal(h.messages.length, messageCount);
  assert.equal(h.widgets.length, widgetCount + 1);
  streamText(h, "Working on: Verifying regression tests");
  assert.equal(h.widgets.length, widgetCount + 1);
});

test("partial goals wait for text completion and assistant messages are not rewritten", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  const event = {
    message: { role: "assistant", content: [{ type: "text", text: "Working on: Verifying" }] },
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Working on: Verifying" },
  };
  const original = structuredClone(event);
  h.emit("message_start", { message: event.message });
  h.emit("message_update", event);
  assert.equal(h.goal(), "Working on: Awaiting task summary");
  assert.deepEqual(event, original);
  h.emit("message_update", {
    message: event.message,
    assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Working on: Verifying regression tests" },
  });
  assert.equal(h.goal(), "Working on: Verifying regression tests");
});

test("message-end text can supply a missing normalized text stream", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  const message = {
    role: "assistant", stopReason: "toolUse",
    content: [
      { type: "text", text: "Working on: Checking cancellation cleanup" },
      { type: "toolCall", id: "one", name: "bash", arguments: { command: "SECRET" } },
    ],
  };
  const original = structuredClone(message);
  h.emit("message_start", { message });
  h.emit("message_end", { message });
  assert.equal(h.goal(), "Working on: Checking cancellation cleanup");
  assert.match(h.last()!, /^Preparing tools/);
  assert.deepEqual(message, original);
});

test("goals survive tools, approvals, next turns, and ordinary replies", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  streamText(h, "Working on: Verifying regression tests");
  const widgetCount = h.widgets.length;
  h.emit("tool_execution_start", { toolCallId: "one", toolName: "bash", args: { command: "SECRET" } });
  h.emit("ui_prompt_start", { kind: "confirm", title: "SECRET" });
  assert.match(h.last()!, /^Waiting for approval/);
  assert.equal(h.goal(), "Working on: Verifying regression tests");
  h.emit("ui_prompt_end");
  h.emit("tool_execution_end", { toolCallId: "one", isError: true });
  h.emit("turn_start");
  streamText(h, "An ordinary reply without a goal");
  assert.equal(h.goal(), "Working on: Verifying regression tests");
  assert.equal(h.widgets.length, widgetCount);
});

test("user input, hidden thinking, tool data, and later text blocks are not goal sources", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  for (const role of ["user", "toolResult"]) {
    h.emit("message_start", { message: { role } });
    h.emit("message_update", {
      message: { role },
      assistantMessageEvent: { type: "text_delta", delta: "Working on: A fabricated purpose\n" },
    });
  }
  h.emit("message_update", {
    message: { role: "assistant", content: [{ type: "thinking", thinking: "Working on: A hidden purpose" }] },
    assistantMessageEvent: { type: "thinking_delta", delta: "Working on: A hidden purpose" },
  });
  h.emit("tool_execution_start", {
    toolCallId: "one", toolName: "bash", args: { command: "Working on: A command argument" },
  });
  h.emit("tool_execution_update", { partialResult: { content: [{ type: "text", text: "Working on: Tool output" }] } });
  h.emit("tool_execution_end", { toolCallId: "one", isError: false });
  streamText(h, "Ordinary commentary\nWorking on: A body example");
  h.emit("message_update", {
    message: { role: "assistant" },
    assistantMessageEvent: { type: "text_end", contentIndex: 1, content: "Working on: A later block" },
  });
  assert.equal(h.goal(), "Working on: Awaiting task summary");
  assert.equal(h.widgets.length, 1);
});

test("invalid goal statements do not replace a valid purpose", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  streamText(h, "Working on: Verifying regression tests");
  for (const invalid of ["Working on: 검증 중", "Working on: Reading /private/config", "Working on: Checking \x1b[31mcontrols"]) {
    streamText(h, invalid);
    assert.equal(h.goal(), "Working on: Verifying regression tests");
  }
});

test("abort clears a published goal, and a new run starts without stale text", (t) => {
  const h = harness(t);
  h.emit("agent_start");
  streamText(h, "Working on: Verifying regression tests");
  h.controller.abort();
  assert.equal(h.goal(), undefined);
  assert.equal(h.last(), undefined);
  const widgetCount = h.widgets.length;
  h.advance(5000);
  assert.equal(h.widgets.length, widgetCount);
  h.ctx.signal = new AbortController().signal;
  h.emit("agent_start");
  assert.equal(h.goal(), "Working on: Awaiting task summary");
});

test("active reload clears a published purpose and starts with an honest fallback", (t) => {
  const h = harness(t, "tui", false);
  h.emit("session_start");
  streamText(h, "Working on: Verifying regression tests");
  h.emit("session_start");
  assert.equal(h.goal(), "Working on: Awaiting task summary");
  assert.equal(h.widgets.at(-2)?.content, undefined);
  assert.equal(h.cleared.mock.callCount(), 1);
  assert.equal(h.scheduled.mock.callCount(), 2);
});

test("TUI runs add a goal guideline without replacing existing structured rules", (t) => {
  const h = harness(t);
  const options = { promptGuidelines: ["Original permissions"], selectedTools: ["bash"] };
  h.emit("before_agent_start", { systemPromptOptions: options });
  h.emit("before_agent_start", { systemPromptOptions: options });
  assert.equal(options.promptGuidelines.length, 2);
  assert.equal(options.promptGuidelines[0], "Original permissions");
  assert.match(options.promptGuidelines[1], /Working on:/);
  assert.deepEqual(options.selectedTools, ["bash"]);
  assert.deepEqual(h.widgets, []);
  assert.equal(h.scheduled.mock.callCount(), 0);
});
