import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { isAutoApproved, requiresPermissionPolicyApproval } from "./fast-path.ts";
import { createAutoModeGate } from "./gate.ts";
import { getPermissionPolicy } from "./permission-policy.ts";
import { isAutoApprovedShellCommand, isReadOnlyShellCommand } from "./shell/screen.ts";
import type { PendingAction } from "./types.ts";

let root: string;
const policy = getPermissionPolicy();
before(() => {
  root = mkdtempSync(join(tmpdir(), "pi-policy-protection-test-"));
  writeFileSync(join(root, "permission-policy.json"), "{}");
  symlinkSync(join(root, "permission-policy.json"), join(root, "alias.json"));
});
after(() => { rmSync(root, { recursive: true, force: true }); });

function boundary() { return { cwd: root, remoteUrls: [] }; }

const protectedActions: PendingAction[] = [
  { toolName: "edit", input: { path: "permission-policy.json" } },
  { toolName: "write", input: { path: "sub/permission-policy.json" } },
  { toolName: "write", input: { path: "alias.json" } },
  { toolName: "bash", input: { command: "printf '{}' > permission-policy.json" } },
  { toolName: "bash", input: { command: "printf '{}' > alias.json" } },
  { toolName: "bash", input: { command: "cp input.json permission-policy.json" } },
  { toolName: "bash", input: { command: "mv input.json alias.json" } },
  { toolName: "bash", input: { command: "sed -i 's/a/b/' permission-policy.json" } },
  { toolName: "bash", input: { command: "cat input | tee permission-policy.json" } },
  { toolName: "bash", input: { command: "gtimeout 10s touch permission-policy.json" } },
  { toolName: "bash", input: { command: "python3 -c \"open('permission-policy.json', 'w').write('{}')\"" } },
  { toolName: "bash", input: { command: "echo $(cat permission-policy.json)" } },
  { toolName: "powershell", input: { command: "Set-Content permission-policy.json '{}'" } },
];

for (const [index, action] of protectedActions.entries()) {
  test(`policy write ${index + 1} is excluded from automatic approval`, () => {
    assert.equal(requiresPermissionPolicyApproval(action, boundary(), [root], policy), true);
    assert.equal(isAutoApproved(action, boundary(), [root], policy), false);
  });
}

test("policy reads remain automatically approved, including symlinked reads", () => {
  for (const command of ["cat permission-policy.json", "cat alias.json", "sed -n '1,5p' permission-policy.json", "git diff -- permission-policy.json"]) {
    const action = { toolName: "bash", input: { command } };
    assert.equal(requiresPermissionPolicyApproval(action, boundary(), [root], policy), false, command);
    assert.equal(isAutoApproved(action, boundary(), [root], policy), true, command);
  }
  assert.equal(isAutoApproved({ toolName: "read", input: { path: "permission-policy.json" } }, boundary(), [root], policy), true);
});

test("git staging stays auto-approved after cd but is not considered a read", () => {
  const context = { cwd: root, roots: [root], policy };
  assert.equal(isAutoApprovedShellCommand("cd sub && git add file", context), true);
  assert.equal(isReadOnlyShellCommand("git add file", context), false);
  assert.equal(isAutoApprovedShellCommand("cd sub && git add file > output", context), false);
});

test("direct shell screening also refuses policy writes", () => {
  for (const command of ["touch permission-policy.json", "printf x > alias.json", "cp input permission-policy.json"]) {
    assert.equal(isAutoApprovedShellCommand(command, { cwd: root, roots: [root], policy }), false, command);
  }
});

function harness(hasUI = true) {
  let classifierCalls = 0;
  const pi = { exec: async () => ({ code: 0, stdout: "", stderr: "" }) };
  const ctx = {
    cwd: root, hasUI,
    model: { provider: "test", id: "classifier" },
    modelRegistry: {
      find: () => undefined,
      complete: async () => {
        classifierCalls += 1;
        return { stopReason: "stop", content: [{ type: "text", text: '{"verdict":"allow","rule":"none","rationale":""}' }] };
      },
    },
    sessionManager: { getBranch: () => [] },
  } as unknown as ExtensionContext;
  return { gate: createAutoModeGate(pi as never), ctx, classifierCalls: () => classifierCalls };
}

test("policy changes ask the user without consulting even an allowing classifier", async () => {
  const h = harness();
  for (const action of protectedActions) {
    const decision = await h.gate.evaluate(action, h.ctx);
    assert.equal(decision.outcome, "ask");
    assert.equal(decision.rule, "Permission Policy Change");
  }
  assert.equal(h.classifierCalls(), 0);
});

test("headless runs refuse policy changes rather than consulting the classifier", async () => {
  const h = harness(false);
  const decision = await h.gate.evaluate(protectedActions[0], h.ctx);
  assert.equal(decision.outcome, "block");
  if (decision.outcome === "block") assert.match(decision.rationale, /no UI to ask/);
  assert.equal(h.classifierCalls(), 0);
});

test("automode diagnostics include the permission policy location", () => {
  const h = harness();
  assert.match(h.gate.describeConfig(h.ctx), /policy:.*permission-policy\.json/);
});
