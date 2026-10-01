import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import toolModeCycle from "../tool-mode-cycle.ts";
import type { ClassifierResult } from "./types.ts";

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => Promise<unknown>;

function harness(result: ClassifierResult | Error, approved = false, hasUI = true) {
  const handlers = new Map<string, Handler>();
  const prompts: Array<{ title: string; message: string }> = [];
  let classifierCalls = 0;
  toolModeCycle({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerFlag() {},
    registerCommand() {},
    registerShortcut() {},
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  } as never);
  const ctx = {
    cwd: process.cwd(),
    hasUI,
    model: { provider: "test", id: "classifier" },
    modelRegistry: {
      find: () => undefined,
      complete: async () => {
        classifierCalls += 1;
        if (result instanceof Error) throw result;
        return { content: [{ type: "text", text: JSON.stringify(result) }], stopReason: "stop" };
      },
    },
    sessionManager: { getBranch: () => [] },
    ui: {
      confirm: async (title: string, message: string) => {
        prompts.push({ title, message });
        return approved;
      },
    },
  } as unknown as ExtensionContext;
  const call = (command = "node --test tests.ts") => handlers.get("tool_call")!({
    toolName: "bash", input: { command },
  }, ctx);
  return { call, prompts, classifierCalls: () => classifierCalls };
}

const denied: ClassifierResult = {
  verdict: "soft_deny",
  rule: "Code from External",
  rationale: "외부에서 받은 코드를 실행하므로 확인이 필요합니다.",
};

test("a soft denial shows a concise reason and approval still allows the call", async () => {
  const h = harness(denied, true);
  assert.equal(await h.call(), undefined);
  assert.deepEqual(h.prompts, [{
    title: "자동 모드 · 승인 필요",
    message: "이유: 외부에서 받은 코드를 실행하므로 확인이 필요합니다.\n규칙: Code from External\n\nbash 실행을 승인할까요?",
  }]);
  assert.equal(h.classifierCalls(), 1);
});

test("declining retains the original rule and full reason in the blocked result", async () => {
  const h = harness(denied);
  assert.deepEqual(await h.call(), {
    block: true,
    reason: `You declined this call — ${denied.rule}: ${denied.rationale}`,
  });
});

test("classifier failures show the separate safety-check failure explanation", async () => {
  const h = harness(new Error("provider unavailable"), true);
  assert.equal(await h.call(), undefined);
  assert.match(h.prompts[0].message, /이유: 자동 안전 검사를 완료하지 못해 직접 확인이 필요합니다\./);
  assert.match(h.prompts[0].message, /규칙: 안전 검사 실패/);
});

test("allowed and hard-denied calls never request approval", async () => {
  const allowed = harness({ ...denied, verdict: "allow" });
  assert.equal(await allowed.call(), undefined);
  assert.equal(allowed.prompts.length, 0);
  const blocked = harness({ ...denied, verdict: "hard_deny" });
  assert.deepEqual(await blocked.call(), {
    block: true,
    reason: `Auto mode refused this call — ${denied.rule}: ${denied.rationale}`,
  });
  assert.equal(blocked.prompts.length, 0);
});

test("headless sessions still refuse calls that need approval", async () => {
  const h = harness(denied, true, false);
  const result = await h.call() as { block: boolean; reason: string };
  assert.equal(result.block, true);
  assert.match(result.reason, /this session has no UI to ask/);
  assert.equal(h.prompts.length, 0);
});

test("read-only shell calls keep skipping both the classifier and approval", async () => {
  const h = harness(new Error("the classifier must not run"));
  assert.equal(await h.call("git status --short"), undefined);
  assert.equal(h.classifierCalls(), 0);
  assert.equal(h.prompts.length, 0);
});
