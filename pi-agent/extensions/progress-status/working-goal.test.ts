import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkingGoal } from "./working-goal.ts";

const FALLBACK = "Working on: Awaiting task summary";

test("a goal is published only when its first line is complete", () => {
  const goal = new WorkingGoal();
  assert.equal(goal.format(), FALLBACK);
  for (const chunk of ["Work", "ing on: ", "Verifying ", "regression tests"]) {
    goal.append(chunk);
    assert.equal(goal.format(), FALLBACK);
  }
  goal.append("\nMore commentary");
  assert.equal(goal.format(), "Working on: Verifying regression tests");
});

test("every streaming split boundary produces the same completed goal", () => {
  const text = "Working on: Diagnosing missing progress updates\nDetails";
  for (let split = 0; split <= text.length; split++) {
    const goal = new WorkingGoal();
    goal.append(text.slice(0, split));
    goal.append(text.slice(split));
    assert.equal(goal.format(), "Working on: Diagnosing missing progress updates");
  }
});

test("authoritative text-end content works with missing or incomplete deltas", () => {
  const goal = new WorkingGoal();
  goal.append("Working on: Verifying");
  goal.finishText("Working on: Checking cancellation cleanup");
  assert.equal(goal.format(), "Working on: Checking cancellation cleanup");
  goal.beginMessage();
  goal.finishText("Working on: Checking permission prompts\r\nDetails");
  assert.equal(goal.format(), "Working on: Checking permission prompts");
});

test("later lines, text blocks, and quoted markers are not goal sources", () => {
  for (const text of [
    "Normal reply\nWorking on: A fabricated purpose",
    "\nWorking on: A fabricated purpose",
    "> Working on: A quoted purpose",
    "```text\nWorking on: An example\n```",
  ]) {
    const goal = new WorkingGoal();
    goal.append(text);
    goal.finishText();
    goal.finishText("Working on: A later text block");
    assert.equal(goal.format(), FALLBACK);
  }
});

test("invalid summaries cannot replace the last valid goal", () => {
  const goal = new WorkingGoal();
  goal.finishText("Working on: Verifying regression tests");
  for (const invalid of [
    "", " ", "검증 중", "Checking \x1b[31mcontrols", "Checking\tcontrols",
    "Checking \rcontrols", "Checking \u202ebidi", "Reading /private/config",
    "Opening https://example.com", "Running `make test`", "Executing make && test",
    "Using API key sk-abcdef123456", "Using abcdefghijklmnopqrstuvwxyz1234",
    "Reviewing " + "x".repeat(81), "a ".repeat(13).trim(),
  ]) {
    goal.beginMessage();
    goal.finishText(`Working on: ${invalid}`);
    assert.equal(goal.format(), "Working on: Verifying regression tests", JSON.stringify(invalid));
  }
});

test("oversized streamed lines are discarded without scanning the response body", () => {
  const goal = new WorkingGoal();
  goal.append("Working on: " + "x".repeat(1_000_000));
  goal.append("\nWorking on: A fabricated purpose");
  goal.finishText();
  assert.equal(goal.format(), FALLBACK);
  goal.beginMessage();
  goal.append("Working on: Checking recovery");
  goal.finishText();
  assert.equal(goal.format(), "Working on: Checking recovery");
});

test("new messages preserve the goal, while a reset removes it", () => {
  const goal = new WorkingGoal();
  goal.finishText("Working on: Fixing progress visibility");
  goal.beginMessage();
  goal.finishText("An ordinary reply");
  assert.equal(goal.format(), "Working on: Fixing progress visibility");
  goal.beginMessage();
  goal.finishText("Working on: Verifying the fix");
  assert.equal(goal.format(), "Working on: Verifying the fix");
  goal.reset();
  assert.equal(goal.format(), FALLBACK);
});

test("short plain English punctuation and the length boundary are supported", () => {
  const goal = new WorkingGoal();
  goal.finishText("Working on: Reviewing C++ parser behavior (UTF-8)");
  assert.equal(goal.format(), "Working on: Reviewing C++ parser behavior (UTF-8)");
  goal.beginMessage();
  const boundary = "Reviewing " + "parser ".repeat(10).trim() + "s";
  assert.equal(boundary.length, 80);
  goal.finishText(`Working on: ${boundary}`);
  assert.equal(goal.format(), `Working on: ${boundary}`);
});
