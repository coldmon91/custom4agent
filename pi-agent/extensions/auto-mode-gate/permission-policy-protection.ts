/** Recognizes policy paths before trusted-root or model-based approval. */

import { basename } from "node:path";
import { realResolve } from "./paths.ts";
import { PERMISSION_POLICY_FILE } from "./permission-policy.ts";
import { readCommand } from "./shell/tokenize.ts";
import type { PendingAction } from "./types.ts";

export function isPermissionPolicyPath(path: string, cwd: string): boolean {
  return basename(path) === PERMISSION_POLICY_FILE ||
    basename(realResolve(path, cwd)) === PERMISSION_POLICY_FILE;
}

export function referencesPermissionPolicy(action: PendingAction, cwd: string): boolean {
  const path = action.input.path;
  if (typeof path === "string" && isPermissionPolicyPath(path, cwd)) return true;

  const command = action.input.command;
  if (typeof command !== "string") return false;
  // Also catches explicit paths embedded in scripts the shell reader cannot interpret.
  if (command.includes(PERMISSION_POLICY_FILE)) return true;
  const reading = readCommand(command);
  return reading.readable && reading.segments.some((segment) =>
    segment.some((token) => !token.operator && isPermissionPolicyPath(token.text, cwd)),
  );
}
