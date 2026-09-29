import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { withSelectorDiagnostics, writeSelectorDiagnostic } from "./model-selector-diagnostics.ts";

const LOG_FILE = "model-thinking-selector.log";

async function createLogDir(t: { after: (callback: () => Promise<void>) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pi-model-selector-test-"));
  t.after(async () => { await rm(dir, { recursive: true, force: true }); });
  return dir;
}

async function readEntries(dir: string): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(join(dir, LOG_FILE), "utf8");
  return content.trim().split("\n").map((line) => JSON.parse(line));
}

test("logs invocation and completion without changing the handler result", async (t) => {
  const dir = await createLogDir(t);
  const value = await withSelectorDiagnostics(dir, async () => 42);
  const entries = await readEntries(dir);

  assert.equal(value, 42);
  assert.deepEqual(entries.map((entry) => entry.event), ["shortcut invoked", "handler completed"]);
  assert.ok(entries.every((entry) => typeof entry.timestamp === "string"));
  assert.equal((await stat(join(dir, LOG_FILE))).mode & 0o777, 0o600);
});

test("logs the error with a stack and rethrows it", async (t) => {
  const dir = await createLogDir(t);
  const failure = new Error("model registry failed");

  await assert.rejects(withSelectorDiagnostics(dir, async () => { throw failure; }), (error) => error === failure);
  const entries = await readEntries(dir);
  assert.deepEqual(entries.map((entry) => entry.event), ["shortcut invoked", "handler failed"]);
  assert.deepEqual(
    { name: (entries[1].error as Record<string, unknown>).name,
      message: (entries[1].error as Record<string, unknown>).message },
    { name: "Error", message: "model registry failed" },
  );
  assert.match((entries[1].error as Record<string, string>).stack, /model registry failed/);
});

test("logging a non-throwing failure records the diagnostic", async (t) => {
  const dir = await createLogDir(t);
  await writeSelectorDiagnostic(dir, "no API key", "provider/model");
  const entries = await readEntries(dir);

  assert.deepEqual(entries[0].error, { message: "provider/model" });
});

test("a log write failure does not prevent the shortcut or hide its original error", async (t) => {
  const dir = await createLogDir(t);
  const invalidDir = join(dir, "not-a-directory");
  await writeFile(invalidDir, "");
  const originalConsoleError = console.error;
  const failures: unknown[][] = [];
  console.error = (...args: unknown[]) => { failures.push(args); };
  t.after(() => { console.error = originalConsoleError; });

  assert.equal(await withSelectorDiagnostics(invalidDir, async () => "opened"), "opened");
  const failure = new Error("original failure");
  await assert.rejects(withSelectorDiagnostics(invalidDir, async () => { throw failure; }), (error) => error === failure);
  assert.equal(failures.length, 4);
});
