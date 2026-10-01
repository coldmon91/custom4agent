import assert from "node:assert/strict";
import { test } from "node:test";

import { formatApprovalPrompt } from "./approval-prompt.ts";
import { getClassifierSystemPrompt } from "./ruleset.ts";
import type { GateDecision } from "./types.ts";

type ApprovalDecision = Extract<GateDecision, { outcome: "ask" }>;

const decision: ApprovalDecision = {
  outcome: "ask",
  rule: "Code from External",
  rationale: "외부에서 받은 코드를 실행하므로 확인이 필요합니다.",
};

test("approval prompts show the actual reason and rule in a short Korean message", () => {
  const original = structuredClone(decision);
  assert.deepEqual(formatApprovalPrompt(decision, "bash"), {
    title: "자동 모드 · 승인 필요",
    message: "이유: 외부에서 받은 코드를 실행하므로 확인이 필요합니다.\n규칙: Code from External\n\nbash 실행을 승인할까요?",
  });
  assert.deepEqual(decision, original);
});

test("classifier failures are described as unavailable checks, not dangerous actions", () => {
  const prompt = formatApprovalPrompt({
    outcome: "ask",
    rule: "Classifier Unavailable",
    rationale: "classifier call failed: HTTP 503. Approve only if you have checked this action yourself.",
  }, "bash");
  assert.equal(prompt.message, "이유: 자동 안전 검사를 완료하지 못해 직접 확인이 필요합니다.\n규칙: 안전 검사 실패\n\nbash 실행을 승인할까요?");
  assert.ok(!prompt.message.includes("HTTP"));
});

test("empty reasons still explain the need for approval", () => {
  const prompt = formatApprovalPrompt({ ...decision, rationale: " \n\t ", rule: "" }, "write");
  assert.equal(prompt.message, "이유: 자동 안전 검사에서 사용자 확인이 필요한 작업으로 판단했습니다.\n규칙: 사용자 확인 필요\n\nwrite 실행을 승인할까요?");
});

test("long and multiline values stay bounded and cannot add terminal control characters", () => {
  const prompt = formatApprovalPrompt({
    ...decision,
    rationale: "첫 줄\n\t" + "긴 이유 ".repeat(200) + "\u001b\u0007",
    rule: "r".repeat(200) + "\n\u001b",
  }, "t".repeat(200) + "\r\u001b");
  const lines = prompt.message.split("\n");
  assert.equal(lines.length, 4);
  assert.ok(Array.from(lines[0].slice("이유: ".length)).length <= 120);
  assert.ok(Array.from(lines[1].slice("규칙: ".length)).length <= 80);
  assert.ok(Array.from(lines[3].slice(0, -" 실행을 승인할까요?".length)).length <= 60);
  assert.ok(lines[0].endsWith("…"));
  assert.ok(lines[1].endsWith("…"));
  assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(prompt.message));
});

test("truncating a reason preserves Unicode code points", () => {
  const prompt = formatApprovalPrompt({ ...decision, rationale: "😀".repeat(150) }, "bash");
  assert.equal(prompt.message.split("\n")[0], `이유: ${"😀".repeat(119)}…`);
});

test("the classifier is instructed to give a concise explanation without changing verdicts", () => {
  const prompt = getClassifierSystemPrompt();
  assert.ok(prompt.includes("one short, plain-language sentence"));
  assert.ok(prompt.includes("80 characters"));
  assert.ok(prompt.includes('"allow|soft_deny|hard_deny"'));
});
