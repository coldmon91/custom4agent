import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { isAutoApproved } from "./fast-path.ts";
import { createPermissionPolicyLoader, getPermissionPolicyPath, parsePermissionPolicy } from "./permission-policy.ts";
import { isAutoApprovedShellCommand } from "./shell/screen.ts";

const baseline = JSON.parse(readFileSync(getPermissionPolicyPath(), "utf8"));
let root: string;
before(() => { root = mkdtempSync(join(tmpdir(), "pi-permission-policy-test-")); });
after(() => { rmSync(root, { recursive: true, force: true }); });

function fixture(name: string) {
  const directory = join(root, name);
  mkdirSync(directory);
  const path = join(directory, "policy.json");
  const raw = structuredClone(baseline);
  writeFileSync(path, JSON.stringify(raw));
  return { path, raw, load: createPermissionPolicyLoader(path) };
}

function checkPolicyUnavailable(load: ReturnType<typeof createPermissionPolicyLoader>) {
  const policy = load();
  assert.equal(policy.problems.length, 1);
  assert.match(policy.problems[0], /automatic approval disabled/);
  assert.equal(isAutoApproved({ toolName: "read", input: {} }, { cwd: root, remoteUrls: [] }, [root], policy), false);
  assert.equal(isAutoApprovedShellCommand("ls", { cwd: root, roots: [root], policy }), false);
  assert.equal(isAutoApprovedShellCommand("cd sub", { cwd: root, roots: [root], policy }), false);
}

test("the checked-in policy preserves the supported tool roles and git remote listing", () => {
  const policy = parsePermissionPolicy(baseline);
  assert.deepEqual([...policy.tools.readOnly], ["read", "grep", "find", "ls"]);
  assert.deepEqual([...policy.tools.inRootWrite], ["edit", "write"]);
  assert.deepEqual([...policy.tools.screenedShell], ["bash"]);
  assert.ok(policy.shell.gitRemoteReadOnly.has(undefined));
  assert.ok(policy.shell.gitInRootWrite.has("add"));
});

test("unchanged policy files reuse the cached validated policy", () => {
  const f = fixture("cache");
  assert.equal(f.load(), f.load());
});

test("JSON edits change tool and shell decisions on the next call", () => {
  const f = fixture("reload");
  const boundary = { cwd: root, remoteUrls: [] };
  assert.equal(isAutoApproved({ toolName: "read", input: {} }, boundary, [root], f.load()), true);
  assert.equal(isAutoApprovedShellCommand("cat input.txt", { cwd: root, roots: [root], policy: f.load() }), true);
  f.raw.tools.readOnly = f.raw.tools.readOnly.filter((name: string) => name !== "read");
  f.raw.shell.readOnly = f.raw.shell.readOnly.filter((name: string) => name !== "cat");
  writeFileSync(f.path, JSON.stringify(f.raw));
  assert.equal(isAutoApproved({ toolName: "read", input: {} }, boundary, [root], f.load()), false);
  assert.equal(isAutoApprovedShellCommand("cat input.txt", { cwd: root, roots: [root], policy: f.load() }), false);
  f.raw.tools.readOnly.push("probe");
  f.raw.shell.readOnly.push("probe");
  writeFileSync(f.path, JSON.stringify(f.raw));
  assert.equal(isAutoApproved({ toolName: "probe", input: {} }, boundary, [root], f.load()), true);
  assert.equal(isAutoApprovedShellCommand("probe", { cwd: root, roots: [root], policy: f.load() }), true);
});

test("atomic replacements are detected even when file mtime is preserved", () => {
  const f = fixture("replace");
  utimesSync(f.path, new Date(0), new Date(0));
  const before = f.load();
  f.raw.shell.readOnly = f.raw.shell.readOnly.filter((name: string) => name !== "cat");
  const replacement = `${f.path}.new`;
  writeFileSync(replacement, JSON.stringify(f.raw));
  utimesSync(replacement, new Date(0), new Date(0));
  renameSync(replacement, f.path);
  assert.notEqual(f.load(), before);
  assert.equal(f.load().shell.readOnly.has("cat"), false);
});

test("missing, malformed and recreated files cannot retain earlier approvals", () => {
  const f = fixture("recovery");
  assert.equal(f.load().problems.length, 0);
  writeFileSync(f.path, "{");
  checkPolicyUnavailable(f.load);
  assert.equal(f.load(), f.load());
  rmSync(f.path);
  checkPolicyUnavailable(f.load);
  writeFileSync(f.path, JSON.stringify(f.raw));
  assert.equal(f.load().problems.length, 0);
  assert.equal(f.load().shell.readOnly.has("cat"), true);
});

const invalidCases: Array<[string, (raw: typeof baseline) => unknown]> = [
  ["null root", () => null],
  ["array root", () => []],
  ["unsupported version", (raw) => ({ ...raw, version: 2 })],
  ["missing group", (raw) => { delete raw.tools; return raw; }],
  ["unknown field", (raw) => ({ ...raw, typo: true })],
  ["missing list", (raw) => { delete raw.shell.readOnly; return raw; }],
  ["non-array list", (raw) => { raw.tools.readOnly = "read"; return raw; }],
  ["non-string name", (raw) => { raw.tools.readOnly.push(7); return raw; }],
  ["blank name", (raw) => { raw.tools.readOnly.push(""); return raw; }],
  ["whitespace in name", (raw) => { raw.tools.readOnly.push("read bash"); return raw; }],
  ["duplicate name", (raw) => { raw.tools.readOnly.push("read"); return raw; }],
  ["null outside remote list", (raw) => { raw.tools.readOnly.push(null); return raw; }],
  ["duplicate remote null", (raw) => { raw.shell.gitRemoteReadOnly.push(null); return raw; }],
  ["raw bash as read-only", (raw) => { raw.tools.readOnly.push("bash"); return raw; }],
  ["raw powershell as read-only", (raw) => { raw.tools.readOnly.push("powershell"); return raw; }],
  ["write as read-only", (raw) => { raw.tools.readOnly.push("write"); return raw; }],
  ["unknown write contract", (raw) => { raw.tools.inRootWrite.push("mailer"); return raw; }],
  ["unsupported shell dialect", (raw) => { raw.tools.screenedShell.push("powershell"); return raw; }],
  ["conflicting shell roles", (raw) => { raw.shell.readOnly.push("cp"); return raw; }],
  ["conflicting git roles", (raw) => { raw.shell.gitReadOnly.push("add"); return raw; }],
  ["too many entries", (raw) => { raw.shell.readOnly = Array.from({ length: 513 }, (_, i) => `c${i}`); return raw; }],
];

for (const [name, transform] of invalidCases) {
  test(`invalid policy fails closed: ${name}`, () => {
    const f = fixture(`invalid-${invalidCases.findIndex(([label]) => label === name)}`);
    writeFileSync(f.path, JSON.stringify(transform(f.raw)));
    checkPolicyUnavailable(f.load);
  });
}

test("unreadable directories and oversized files disable automatic approval", () => {
  const directory = join(root, "directory");
  mkdirSync(directory);
  checkPolicyUnavailable(createPermissionPolicyLoader(directory));
  const f = fixture("oversized");
  writeFileSync(f.path, " ".repeat(128 * 1024 + 1));
  checkPolicyUnavailable(f.load);
});

test("subcommand and builtin policy changes are honored", () => {
  const f = fixture("subcommands");
  f.raw.shell.gitReadOnly = [];
  f.raw.shell.gitInRootWrite = [];
  f.raw.shell.gitRemoteReadOnly = [];
  f.raw.shell.npmReadOnly = [];
  f.raw.shell.builtins = [];
  f.raw.shell.inRootWrite = [];
  writeFileSync(f.path, JSON.stringify(f.raw));
  const context = { cwd: root, roots: [root], policy: f.load() };
  for (const command of ["git status", "git add file", "git remote", "npm list", "export FOO=bar", "mkdir child"]) {
    assert.equal(isAutoApprovedShellCommand(command, context), false, command);
  }
});
