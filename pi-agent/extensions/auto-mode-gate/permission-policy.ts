/** Loads and validates the auto-approval lists, re-reading changed files. */

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PERMISSION_POLICY_FILE = "permission-policy.json";
const policyPath = join(dirname(fileURLToPath(import.meta.url)), PERMISSION_POLICY_FILE);
const MAX_POLICY_BYTES = 128 * 1024;

export interface PermissionPolicy {
  tools: {
    readOnly: ReadonlySet<string>;
    inRootWrite: ReadonlySet<string>;
    screenedShell: ReadonlySet<string>;
  };
  shell: {
    readOnly: ReadonlySet<string>;
    inRootWrite: ReadonlySet<string>;
    builtins: ReadonlySet<string>;
    gitReadOnly: ReadonlySet<string>;
    gitInRootWrite: ReadonlySet<string>;
    gitRemoteReadOnly: ReadonlySet<string | undefined>;
    npmReadOnly: ReadonlySet<string>;
  };
  problems: readonly string[];
}

function object(raw: unknown, name: string, keys: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${name} must be an object`);
  }
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${name} must contain only: ${keys.join(", ")}`);
  }
  return value;
}

function list(raw: unknown, name: string, nullable = false): Set<string | undefined> {
  if (!Array.isArray(raw) || raw.length > 512) {
    throw new Error(`${name} must be an array with at most 512 entries`);
  }
  const values = new Set<string | undefined>();
  for (const entry of raw) {
    if (entry === null && nullable) {
      if (values.has(undefined)) throw new Error(`${name} contains duplicate null`);
      values.add(undefined);
      continue;
    }
    if (typeof entry !== "string" || !entry || /[\s\u0000-\u001f\u007f/\\]/.test(entry)) {
      throw new Error(`${name} contains an invalid name`);
    }
    if (values.has(entry)) throw new Error(`${name} contains duplicate ${entry}`);
    values.add(entry);
  }
  return values;
}

function names(raw: unknown, name: string): ReadonlySet<string> {
  return list(raw, name) as Set<string>;
}

export function parsePermissionPolicy(raw: unknown): PermissionPolicy {
  const root = object(raw, "policy", ["version", "tools", "shell"]);
  if (root.version !== 1) throw new Error("version must be 1");
  const tools = object(root.tools, "tools", ["readOnly", "inRootWrite", "screenedShell"]);
  const shell = object(root.shell, "shell", [
    "readOnly", "inRootWrite", "builtins", "gitReadOnly", "gitInRootWrite", "gitRemoteReadOnly", "npmReadOnly",
  ]);
  const policy: PermissionPolicy = {
    tools: {
      readOnly: names(tools.readOnly, "tools.readOnly"),
      inRootWrite: names(tools.inRootWrite, "tools.inRootWrite"),
      screenedShell: names(tools.screenedShell, "tools.screenedShell"),
    },
    shell: {
      readOnly: names(shell.readOnly, "shell.readOnly"),
      inRootWrite: names(shell.inRootWrite, "shell.inRootWrite"),
      builtins: names(shell.builtins, "shell.builtins"),
      gitReadOnly: names(shell.gitReadOnly, "shell.gitReadOnly"),
      gitInRootWrite: names(shell.gitInRootWrite, "shell.gitInRootWrite"),
      gitRemoteReadOnly: list(shell.gitRemoteReadOnly, "shell.gitRemoteReadOnly", true),
      npmReadOnly: names(shell.npmReadOnly, "shell.npmReadOnly"),
    },
    problems: [],
  };

  // Tool roles must match the input contracts understood by the gate.
  for (const tool of policy.tools.readOnly) {
    if (["bash", "powershell", "edit", "write"].includes(tool)) {
      throw new Error(`${tool} cannot be a read-only tool`);
    }
    if (policy.tools.inRootWrite.has(tool) || policy.tools.screenedShell.has(tool)) {
      throw new Error(`tool roles overlap for ${tool}`);
    }
  }
  for (const tool of policy.tools.inRootWrite) {
    if (tool !== "edit" && tool !== "write") throw new Error(`unsupported path-write tool: ${tool}`);
  }
  for (const tool of policy.tools.screenedShell) {
    if (tool !== "bash") throw new Error(`unsupported screened shell: ${tool}`);
  }
  for (const command of policy.shell.readOnly) {
    if (policy.shell.inRootWrite.has(command)) throw new Error(`shell roles overlap for ${command}`);
  }
  for (const subcommand of policy.shell.gitReadOnly) {
    if (policy.shell.gitInRootWrite.has(subcommand)) throw new Error(`git roles overlap for ${subcommand}`);
  }
  return policy;
}

function unavailablePolicy(detail: string): PermissionPolicy {
  return {
    tools: { readOnly: new Set(), inRootWrite: new Set(), screenedShell: new Set() },
    shell: {
      readOnly: new Set(), inRootWrite: new Set(), builtins: new Set(), gitReadOnly: new Set(),
      gitInRootWrite: new Set(), gitRemoteReadOnly: new Set(), npmReadOnly: new Set(),
    },
    problems: [`${PERMISSION_POLICY_FILE}: ${detail}; automatic approval disabled`],
  };
}

/** A separate loader lets tests exercise file changes without touching the live policy. */
export function createPermissionPolicyLoader(path: string = policyPath): () => PermissionPolicy {
  let cached: PermissionPolicy | undefined;
  let cachedStamp: string | undefined;
  return () => {
    try {
      const stat = statSync(path);
      const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
      if (cached && stamp === cachedStamp) return cached;
      if (stat.size > MAX_POLICY_BYTES) throw new Error(`file exceeds ${MAX_POLICY_BYTES} bytes`);
      let policy: PermissionPolicy;
      try {
        policy = parsePermissionPolicy(JSON.parse(readFileSync(path, "utf8")));
      } catch (error) {
        policy = unavailablePolicy(error instanceof Error ? error.message : String(error));
      }
      cached = policy;
      cachedStamp = stamp;
      return policy;
    } catch (error) {
      cached = undefined;
      cachedStamp = undefined;
      return unavailablePolicy(error instanceof Error ? error.message : String(error));
    }
  };
}

export const getPermissionPolicy = createPermissionPolicyLoader();

export function getPermissionPolicyPath(): string {
  return policyPath;
}
