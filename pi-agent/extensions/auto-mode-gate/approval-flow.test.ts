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

test("a soft denial is the classifier's yes and does not ask", async () => {
  const h = harness(denied, false);
  assert.equal(await h.call(), undefined);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.classifierCalls(), 1);
});

test("classifier failures pass without an approval prompt", async () => {
  const h = harness(new Error("provider unavailable"), false);
  assert.equal(await h.call(), undefined);
  assert.equal(h.prompts.length, 0);
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

test("headless sessions also pass a soft denial without asking", async () => {
  const h = harness(denied, false, false);
  assert.equal(await h.call(), undefined);
  assert.equal(h.prompts.length, 0);
});

test("read-only shell calls keep skipping both the classifier and approval", async () => {
  const h = harness(new Error("the classifier must not run"));
  assert.equal(await h.call("git status --short"), undefined);
  assert.equal(h.classifierCalls(), 0);
  assert.equal(h.prompts.length, 0);
});
