import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { isAutoApproved } from "./fast-path.ts";
import type { TrustBoundary } from "./types.ts";

let root: string;
let boundary: TrustBoundary;

/**
 * A directory to treat as the working directory, plus a symlink pointing out of
 * it — the case a naive path-prefix check would wave through.
 */
before(() => {
  root = join(tmpdir(), `auto-mode-gate-fastpath-${process.pid}`);
  const repo = join(root, "repo");
  const outside = join(root, "outside");

  mkdirSync(join(repo, "sub"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(repo, "sub", "in.txt"), "in\n");
  writeFileSync(join(outside, "secret.txt"), "secret\n");
  symlinkSync(outside, join(repo, "escape"));

  boundary = { cwd: repo, remoteUrls: [] };
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

const check = (toolName: string, input: Record<string, unknown>) =>
  isAutoApproved({ toolName, input }, boundary);

test("read-only tools skip the classifier even outside the directory", () => {
  for (const tool of ["read", "grep", "find", "ls"]) {
    assert.equal(check(tool, { path: "/etc/passwd" }), true, tool);
  }
});

test("shell tools always reach the classifier", () => {
  assert.equal(check("bash", { command: "ls" }), false);
  assert.equal(check("powershell", { command: "ls" }), false);
});

test("writes inside the working directory are auto-approved", () => {
  assert.equal(check("write", { path: "sub/new.txt" }), true, "relative");
  assert.equal(check("edit", { path: join(boundary.cwd, "sub", "in.txt") }), true, "absolute");
  assert.equal(check("write", { path: "./sub/../sub/x.txt" }), true, "needs normalising");
});

test("writes that escape the working directory are classified", () => {
  assert.equal(check("write", { path: "../outside/secret.txt" }), false, "parent traversal");
  assert.equal(check("write", { path: "/etc/hosts" }), false, "absolute elsewhere");
  assert.equal(check("edit", { path: "escape/secret.txt" }), false, "through a symlink");
  assert.equal(check("write", { path: "escape/new.txt" }), false, "new file through a symlink");
});

test("a call with no usable path is not auto-approved", () => {
  assert.equal(check("write", {}), false, "missing path");
  assert.equal(check("write", { path: "" }), false, "empty path");
  assert.equal(check("write", { path: 42 }), false, "non-string path");
});

test("unknown tools are classified rather than assumed safe", () => {
  assert.equal(check("mcp__mailer__send", { to: "someone" }), false);
});
