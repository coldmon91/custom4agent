/**
 * Decides which tool calls skip the classifier entirely.
 *
 * This mirrors stage 2 of Claude Code's auto-mode ordering: read-only work and
 * writes that land in a trusted root are approved without a model call. Shell
 * commands get the same treatment when they can be read confidently — see
 * `shell/screen.ts`. Everything else falls through to the classifier.
 */

import { isInsideAnyRoot } from "./paths.ts";
import { isAutoApprovedShellCommand, isReadOnlyShellCommand } from "./shell/screen.ts";
import { getPermissionPolicy, type PermissionPolicy } from "./permission-policy.ts";
import { referencesPermissionPolicy } from "./permission-policy-protection.ts";
import { looksSensitive } from "./shell/command-policy.ts";
import { getTrustedRoots } from "./trusted-roots.ts";
import type { PendingAction, TrustBoundary } from "./types.ts";

/** The working directory plus whatever the user declared in trusted-roots.json. */
export function trustedRootsFor(boundary: TrustBoundary): string[] {
  return [boundary.cwd, ...getTrustedRoots().directories];
}

function targetPath(action: PendingAction): string | undefined {
  const path = action.input.path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

function shellCommand(action: PendingAction): string | undefined {
  const command = action.input.command;
  return typeof command === "string" && command.length > 0 ? command : undefined;
}

/**
 * `true` when the action is safe by construction and needs no classifier call.
 *
 * `roots` is passed in rather than read here so the caller decides once per
 * evaluation what counts as trusted, and so it can be varied under test.
 */
export function isAutoApproved(
  action: PendingAction,
  boundary: TrustBoundary,
  roots: readonly string[] = trustedRootsFor(boundary),
  policy: PermissionPolicy = getPermissionPolicy(),
): boolean {
  if (policy.problems.length > 0) return false;
  if (policy.tools.readOnly.has(action.toolName)) return true;

  if (requiresPermissionPolicyApproval(action, boundary, roots, policy)) return false;

  if (policy.tools.inRootWrite.has(action.toolName)) {
    const path = targetPath(action);
    // A malformed call has no path to vet, so let the classifier see it.
    if (path === undefined || looksSensitive(path)) return false;
    return isInsideAnyRoot(path, roots, boundary.cwd);
  }

  if (policy.tools.screenedShell.has(action.toolName)) {
    const command = shellCommand(action);
    if (command === undefined) return false;
    return isAutoApprovedShellCommand(command, { cwd: boundary.cwd, roots, policy });
  }

  return false;
}

/** Policy changes require user approval even when a classifier would allow them. */
export function requiresPermissionPolicyApproval(
  action: PendingAction,
  boundary: TrustBoundary,
  roots: readonly string[],
  policy: PermissionPolicy,
): boolean {
  if (policy.tools.readOnly.has(action.toolName) || !referencesPermissionPolicy(action, boundary.cwd)) return false;
  const command = shellCommand(action);
  return action.toolName !== "bash" || command === undefined ||
    !isReadOnlyShellCommand(command, { cwd: boundary.cwd, roots, policy });
}
