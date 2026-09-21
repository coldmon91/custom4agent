/**
 * Shared types for the auto-mode permission gate.
 */

/** What the gate concluded for one pending tool call. */
export type GateDecision =
  | { outcome: "allow"; rule?: string }
  | { outcome: "ask"; rule: string; rationale: string }
  | { outcome: "block"; rule: string; rationale: string };

/** Verdict vocabulary of the Claude Code auto-mode ruleset. */
export type ClassifierVerdict = "allow" | "soft_deny" | "hard_deny";

export interface ClassifierResult {
  verdict: ClassifierVerdict;
  /** Rule name the classifier matched, e.g. "Git Destructive". */
  rule: string;
  rationale: string;
}

/** The tool call awaiting a decision. */
export interface PendingAction {
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * What the gate treats as the user's own infrastructure. Captured once at
 * session start so a remote added mid-session cannot widen the boundary.
 */
export interface TrustBoundary {
  cwd: string;
  /** `git remote -v` URLs present when the session started. */
  remoteUrls: string[];
}

export interface RuleSet {
  allow: string[];
  soft_deny: string[];
  hard_deny: string[];
}

/** A `provider/modelId` pair; the id itself may contain slashes. */
export interface ModelRef {
  provider: string;
  modelId: string;
}

export type ThinkingLevelName =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ClassifierConfig {
  /** Tried in order; the first that exists with configured auth wins. */
  models: ModelRef[];
  reasoning: ThinkingLevelName;
  timeoutMs: number;
  /** Anything wrong with the config file, for surfacing to the user. */
  problems: string[];
}
