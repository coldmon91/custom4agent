import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TaskError } from "./errors.ts";

export const AGENTS = ["claude", "codex", "pi", "opencode"] as const;
export type Agent = (typeof AGENTS)[number];

export type SessionLookup = { command: string } | { skipped: string };

const ENV_SESSION: Record<Exclude<Agent, "opencode">, { variable: string; format: (id: string) => string }> = {
  claude: { variable: "CLAUDE_CODE_SESSION_ID", format: (id) => `claude --resume ${id}` },
  codex: { variable: "CODEX_THREAD_ID", format: (id) => `codex resume ${id}` },
  pi: { variable: "PI_SESSION_ID", format: (id) => `pi --session ${id}` },
};

export function parseAgent(value: string): Agent {
  if ((AGENTS as readonly string[]).includes(value)) return value as Agent;
  throw new TaskError("invalid_value", `--agent must be one of ${AGENTS.join(", ")}`, { agent: value });
}

function agentsInEnvironment(): Agent[] {
  const present: Agent[] = [];
  for (const [agent, spec] of Object.entries(ENV_SESSION)) {
    if (process.env[spec.variable]) present.push(agent as Agent);
  }
  if (process.env.OPENCODE === "1") present.push("opencode");
  return present;
}

/** opencode has no session variable: take the latest top-level session started in this directory. */
function opencodeSessionId(): string | undefined {
  const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  const dbPath = join(dataHome, "opencode", "opencode.db");
  if (!existsSync(dbPath)) return undefined;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db
      .prepare("select id from session where directory = ? and parent_id is null order by time_updated desc limit 1")
      .get(process.cwd()) as { id?: string } | undefined;
    return row?.id;
  } finally {
    db.close();
  }
}

/**
 * Resume command of the calling agent's session. Without `--agent`, it is inferred only when
 * exactly one agent's variable is set: a delegated agent inherits its parent's variables.
 */
export function lookupSession(agent: Agent | undefined): SessionLookup {
  let target = agent;
  if (!target) {
    const present = agentsInEnvironment();
    if (present.length === 0) return { skipped: "no agent session found in the environment" };
    if (present.length > 1) return { skipped: `several agent sessions in the environment (${present.join(", ")}); pass --agent` };
    target = present[0];
  }
  if (target === "opencode") {
    const id = opencodeSessionId();
    return id ? { command: `opencode -s ${id}` } : { skipped: "no opencode session found for this directory" };
  }
  const spec = ENV_SESSION[target];
  const id = process.env[spec.variable];
  return id ? { command: spec.format(id) } : { skipped: `${spec.variable} is not set` };
}
