import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = join(import.meta.dirname, "..", "tasks.mjs");
const AGENT_VARIABLES = ["CLAUDE_CODE_SESSION_ID", "CODEX_THREAD_ID", "PI_SESSION_ID", "OPENCODE"];
const RUN_TIMEOUT_MS = 30_000;

export interface Sandbox {
  root: string;
  vault: string;
  settings: string;
  tasksDir: string;
  cleanup: () => void;
}

/** Empty Obsidian vault plus a settings path, both inside a fresh temp dir. */
export function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "managing-tasks-test-"));
  const vault = join(root, "vault");
  mkdirSync(join(vault, ".obsidian"), { recursive: true });
  return {
    root,
    vault,
    settings: join(root, "config", "setting.json"),
    tasksDir: join(vault, "Tasks"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function childEnv(sandbox: Sandbox, extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MANAGING_TASKS_SETTINGS: sandbox.settings, ...extra };
  for (const name of AGENT_VARIABLES) if (!(name in extra)) delete env[name];
  return env;
}

export interface CliResult {
  status: number | null;
  json: { ok: boolean; error?: { code: string; [key: string]: unknown }; [key: string]: any };
}

export function cli(sandbox: Sandbox, args: string[], env: Record<string, string> = {}, cwd?: string): CliResult {
  const run = spawnSync(process.execPath, [ENTRY, ...args], {
    env: childEnv(sandbox, env), cwd, encoding: "utf8", timeout: RUN_TIMEOUT_MS,
  });
  if (run.error) throw run.error;
  try {
    return { status: run.status, json: JSON.parse(run.stdout) };
  } catch {
    throw new Error(`non-JSON output (status ${run.status}):\n${run.stdout}\n${run.stderr}`);
  }
}

/** Concurrent variant used to race several processes against each other. */
export function cliAsync(sandbox: Sandbox, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY, ...args], { env: childEnv(sandbox, {}), timeout: RUN_TIMEOUT_MS });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (status) => {
      try {
        resolve({ status, json: JSON.parse(stdout) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function read(path: string): string {
  return readFileSync(path, "utf8");
}
