/**
 * The auto-mode permission gate.
 *
 * Reproduces Claude Code's auto-mode decision order for pi:
 *   1. read-only work and writes inside a trusted root are approved without a model call
 *   2. everything else is judged by a classifier against the auto-mode ruleset
 *   3. `allow` and `soft_deny` run. Only `hard_deny` is refused.
 *
 * There is no approval dialog. The classifier's allow is the yes. A soft
 * denial is the same yes: the model did not choose a hard refusal. A hard
 * denial still blocks.
 *
 * The gate owns no mode state. `tool-mode-cycle` decides when to consult it,
 * which keeps one `tool_call` handler authoritative and avoids the extension
 * load-order race that a `pi.events` handshake would introduce.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ClassifierUnavailableError, classify, resolveClassifierModel } from "./classifier.ts";
import { getClassifierConfig, getClassifierConfigPath } from "./classifier-config.ts";
import { isAutoApproved, trustedRootsFor } from "./fast-path.ts";
import { getPermissionPolicy, getPermissionPolicyPath } from "./permission-policy.ts";
import { getClassifierSystemPrompt, renderTrustBoundary } from "./ruleset.ts";
import { getTrustedRoots, getTrustedRootsPath } from "./trusted-roots.ts";
import { buildClassifierRequest } from "./transcript.ts";
import { captureTrustBoundary } from "./trust-boundary.ts";
import type { GateDecision, PendingAction, TrustBoundary } from "./types.ts";

export type { GateDecision } from "./types.ts";

export interface AutoModeGate {
  /** Re-snapshots the trust boundary. Call on session start and session tree changes. */
  captureBoundary(ctx: ExtensionContext): Promise<void>;
  /** Judges one pending tool call. */
  evaluate(action: PendingAction, ctx: ExtensionContext): Promise<GateDecision>;
  /** Name of the model the gate would use, for status and diagnostics. */
  describeClassifier(ctx: ExtensionContext): string;
  /** Config file location plus anything wrong with it, for `/automode`. */
  describeConfig(ctx: ExtensionContext): string;
}

export function createAutoModeGate(pi: ExtensionAPI): AutoModeGate {
  let boundary: TrustBoundary | undefined;

  async function boundaryFor(ctx: ExtensionContext): Promise<TrustBoundary> {
    if (!boundary || boundary.cwd !== ctx.cwd) {
      boundary = await captureTrustBoundary(pi, ctx.cwd);
    }
    return boundary;
  }

  /**
   * A former approval request. The dialog is disabled, so the call proceeds.
   * The rule is kept on the allow result for diagnostics.
   */
  function allowWithoutPrompt(rule: string): GateDecision {
    return { outcome: "allow", rule };
  }

  /**
   * Chosen when the classifier itself cannot answer. Proceeding is preferred
   * over a dialog the user does not use, and over blocking a transient outage.
   */
  function fallbackForUnavailableClassifier(_ctx: ExtensionContext, _detail: string): GateDecision {
    return allowWithoutPrompt("Classifier Unavailable");
  }

  return {
    async captureBoundary(ctx) {
      boundary = await captureTrustBoundary(pi, ctx.cwd);
    },

    describeClassifier(ctx) {
      const model = resolveClassifierModel(ctx);
      return model ? `${model.provider}/${model.id}` : "unavailable";
    },

    describeConfig(ctx) {
      const config = getClassifierConfig();
      const chain = config.models.map((m) => `${m.provider}/${m.modelId}`).join(" → ");
      const policy = getPermissionPolicy();
      const trusted = getTrustedRoots();
      const roots = [ctx.cwd, ...trusted.directories].join("\n           ");
      const lines = [
        `in use:    ${this.describeClassifier(ctx)}`,
        `chain:     ${chain}`,
        `reasoning: ${config.reasoning}    timeout: ${config.timeoutMs}ms`,
        `config:    ${getClassifierConfigPath()}`,
        `policy:    ${getPermissionPolicyPath()}`,
        "",
        "Skipping the screener entirely: read-only tools, read-only shell commands,",
        "and writes landing in a trusted root.",
        `roots:     ${roots}`,
        `           (${getTrustedRootsPath()})`,
      ];

      if (config.problems.length > 0) {
        lines.push(...config.problems.map((problem) => `problem:   ${problem}`));
      }

      if (policy.problems.length > 0) {
        lines.push(...policy.problems.map((problem) => `problem:   ${problem}`));
      }

      if (trusted.problems.length > 0) {
        lines.push(...trusted.problems.map((problem) => `problem:   ${problem}`));
      }

      return lines.join("\n");
    },

    async evaluate(action, ctx) {
      const activeBoundary = await boundaryFor(ctx);
      const roots = trustedRootsFor(activeBoundary);

      const policy = getPermissionPolicy();
      if (isAutoApproved(action, activeBoundary, roots, policy)) {
        return { outcome: "allow", rule: "Read-Only / Trusted Root" };
      }

      let result;
      try {
        result = await classify(
          ctx,
          getClassifierSystemPrompt(),
          buildClassifierRequest(
            ctx,
            action,
            renderTrustBoundary(activeBoundary, roots),
          ),
        );
      } catch (error) {
        const detail =
          error instanceof ClassifierUnavailableError
            ? error.message
            : `classifier call failed: ${error instanceof Error ? error.message : String(error)}`;
        return fallbackForUnavailableClassifier(ctx, detail);
      }

      if (result.verdict === "allow") {
        return { outcome: "allow", rule: result.rule };
      }

      if (result.verdict === "hard_deny") {
        return { outcome: "block", rule: result.rule, rationale: result.rationale };
      }

      return allowWithoutPrompt(result.rule);
    },
  };
}
