import assert from "node:assert/strict";
import { test } from "node:test";
import { ProgressState } from "./progress-state.ts";

test("elapsed time advances without inventing new events or a stalled state", () => {
  const state = new ProgressState();
  assert.equal(state.format(0), undefined);
  state.start(0);
  assert.equal(state.format(87_000), "Waiting for model · 87s · last event 87s ago");
  state.observe(87_000);
  assert.equal(state.format(90_000), "Waiting for model · 90s · last event 3s ago");
  assert.doesNotMatch(state.format(600_000)!, /stalled|stopped|running/);
});

test("parallel and nested tool calls remain visible until their own completion", () => {
  const state = new ProgressState();
  state.start(0);
  state.startTool("one", "bash", 1000);
  state.startTool("two", "read", 2000);
  assert.match(state.format(2000)!, /read: processing \(2 tools\)/);
  state.endTool("two", false, 3000);
  assert.match(state.format(3000)!, /bash: processing/);
  state.startTool("one/1", "grep", 4000);
  state.endTool("one", false, 5000);
  assert.match(state.format(5000)!, /bash: completed · follow-up/);
  assert.doesNotMatch(state.format(5000)!, /grep|processing/);
});

test("user prompts take precedence over tool and provider activity", () => {
  const state = new ProgressState();
  state.start(0);
  state.startTool("one", "bash", 1000);
  state.startPrompt("confirm", 2000);
  state.modelPhase("Thinking", 3000);
  assert.match(state.format(3000)!, /^Waiting for approval/);
  state.endPrompt(4000);
  assert.match(state.format(4000)!, /^bash: processing/);
  state.startPrompt("custom", 5000);
  assert.match(state.format(5000)!, /^Waiting for input/);
});

test("nested provider calls do not replace an active tool's stage", () => {
  const state = new ProgressState();
  state.start(0);
  state.startTool("one", "bash", 1000);
  state.modelPhase("Waiting for model", 2000);
  assert.match(state.format(2000)!, /^bash: processing/);
  state.endTool("one", true, 3000);
  assert.match(state.format(3000)!, /^bash: failed · follow-up/);
});

test("tool names are bounded and cannot inject terminal controls", () => {
  const state = new ProgressState();
  state.start(0);
  state.startTool("one", "\x1b[31msecret\n" + "x".repeat(100), 1000);
  assert.doesNotMatch(state.format(1000)!, /\x1b|\n/);
  assert.ok(state.format(1000)!.length < 100);
});

test("stop clears all state and a new run starts its own clock", () => {
  const state = new ProgressState();
  state.start(0);
  state.startTool("one", "bash", 1000);
  state.startPrompt("confirm", 2000);
  state.stop();
  assert.equal(state.format(3000), undefined);
  state.start(4000);
  assert.equal(state.format(5000), "Waiting for model · 1s · last event 1s ago");
});
