export type ErrorCode =
  | "usage"
  | "config_missing"
  | "config_invalid"
  | "vault_missing"
  | "not_obsidian_vault"
  | "tasks_dir_missing"
  | "template_missing"
  | "invalid_title"
  | "invalid_value"
  | "not_found"
  | "ambiguous"
  | "conflict"
  | "legacy_task"
  | "needs_confirmation"
  | "locked"
  | "git_failed";

/** Expected failure reported to the caller as JSON instead of a stack trace. */
export class TaskError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TaskError";
    this.code = code;
    this.details = details;
  }
}
