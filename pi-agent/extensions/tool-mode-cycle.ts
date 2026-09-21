import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AutoModeGate, createAutoModeGate } from "./auto-mode-gate/gate.ts";
import { pinClassifierModel } from "./auto-mode-gate/classifier.ts";
import { parseModelRef } from "./auto-mode-gate/classifier-config.ts";

type ToolMode = "read" | "write" | "auto";

type PersistedMode = ToolMode | "plan" | "readonly";

/**
 * Bumped when `auto` gained the permission gate. Version 1 records called the
 * ungated shell-preferring mode "auto"; that mode is now "write", so an old
 * record must not be restored as a gated session.
 */
const STATE_VERSION = 2;

interface ToolModeState {
  version?: number;
  mode: PersistedMode;
  autoTools?: string[];
}

const READ_TOOLS = ["read", "grep", "find", "ls"];
const DEFAULT_AUTO_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const MODE_ORDER: ToolMode[] = ["auto", "write", "read"];
const DEFAULT_MODE: ToolMode = "auto";
// Shell tools in preference order; the first active one drives the shell prompt.
const SHELL_TOOLS = ["bash", "powershell"];

const READ_MODE_PROMPT = [
  "[READ MODE]",
  "Use only read-only investigation. Do not propose or attempt file changes in this mode.",
  "If edits are needed, explain them without applying them.",
].join("\n");

const AUTO_MODE_GATE_PROMPT = [
  "Every call that is not read-only, and every file change outside the working directory,",
  "is screened before it runs. A screened-out call comes back with the reason it was refused;",
  "treat that as a decision and find another approach rather than retrying it verbatim.",
].join("\n");

function shellUsageHint(shellTool: string): string {
  if (shellTool === "powershell") {
    return "read files with Get-Content, search with Select-String and Get-ChildItem, and change files with here-strings or short scripts";
  }
  return "read files with cat, head, or sed -n, search with grep and find, and change files with sed, heredocs, or short scripts";
}

// Pi's system prompt carries no OS information, so name the userland the shell
// commands run against; the model derives the dialect differences from it.
// Reports the pi host: a shell routed elsewhere (container, micro-VM) is not detected.
function shellUserland(): string | undefined {
  switch (process.platform) {
    case "darwin":
      return "macOS, BSD userland";
    case "linux":
      return "Linux, GNU coreutils";
    case "win32":
      return "Git Bash on Windows";
    default:
      return undefined;
  }
}

function buildShellModePrompt(mode: "write" | "auto", shellTool: string): string {
  // The powershell tool implies Windows; only the POSIX shell needs the userland label.
  const userland = shellTool === "bash" ? shellUserland() : undefined;
  const shell = userland ? `\`${shellTool}\` tool (${userland})` : `\`${shellTool}\` tool`;

  const lines = [
    `[${mode.toUpperCase()} MODE]`,
    `Do your work through the ${shell} wherever it can accomplish the job: ${shellUsageHint(shellTool)}, rather than the dedicated read, edit, or write tools.`,
    "Fall back to a dedicated tool only when the shell genuinely cannot do the job.",
    "This overrides the general preference for dedicated file and search tools.",
  ];

  if (mode === "auto") lines.push(AUTO_MODE_GATE_PROMPT);

  return lines.join("\n");
}

function uniqueToolNames(toolNames: string[]): string[] {
  return [...new Set(toolNames)];
}

export function normalizeMode(state: ToolModeState | undefined): ToolMode {
  if (!state) return DEFAULT_MODE;

  const mode = state.mode;
  if (mode === "read" || mode === "readonly" || mode === "plan") return "read";
  if (mode === "write") return "write";

  // "auto" before STATE_VERSION 2 meant today's ungated "write".
  if (mode === "auto") return (state.version ?? 1) >= 2 ? "auto" : "write";

  return DEFAULT_MODE;
}

function parseMode(value: string | undefined): ToolMode | undefined {
  const mode = value?.trim().toLowerCase();
  return mode === "read" || mode === "write" || mode === "auto" ? mode : undefined;
}

function modeStatus(mode: ToolMode, ctx: ExtensionContext): string {
  switch (mode) {
    case "read":
      return "\x1b[38;5;71m● read\x1b[0m";
    case "write":
      return "\x1b[38;5;215m● write\x1b[0m";
    case "auto":
      return ctx.ui.theme.fg("success", "● auto");
  }
}

export default function toolModeCycle(pi: ExtensionAPI) {
  let currentMode: ToolMode = DEFAULT_MODE;
  let autoTools: string[] | undefined;
  const gate: AutoModeGate = createAutoModeGate(pi);

  function getFallbackAutoTools(): string[] {
    return uniqueToolNames(DEFAULT_AUTO_TOOLS);
  }

  function activeShellTool(): string | undefined {
    const active = new Set(pi.getActiveTools());
    return SHELL_TOOLS.find((tool) => active.has(tool));
  }

  function setStatus(ctx: ExtensionContext) {
    ctx.ui.setStatus("tool-mode", modeStatus(currentMode, ctx));
  }

  function persistState() {
    pi.appendEntry<ToolModeState>("tool-mode", {
      version: STATE_VERSION,
      mode: currentMode,
      autoTools,
    });
  }

  function applyModeTools(mode: ToolMode) {
    if (mode === "read") {
      pi.setActiveTools(READ_TOOLS);
      return;
    }

    pi.setActiveTools(uniqueToolNames(autoTools?.length ? autoTools : getFallbackAutoTools()));
  }

  function setMode(mode: ToolMode, ctx: ExtensionContext, announce = true) {
    if (mode === "read" && currentMode !== "read") {
      autoTools = uniqueToolNames(pi.getActiveTools());
    }
    if (mode !== "read" && (!autoTools || autoTools.length === 0)) {
      autoTools = getFallbackAutoTools();
    }

    currentMode = mode;
    applyModeTools(mode);
    setStatus(ctx);
    persistState();

    if (!announce) return;
    ctx.ui.notify(`Switched to ${mode} mode`, "info");
  }

  function cycleMode(ctx: ExtensionContext) {
    const index = MODE_ORDER.indexOf(currentMode);
    const nextMode = MODE_ORDER[(index + 1) % MODE_ORDER.length] ?? DEFAULT_MODE;
    setMode(nextMode, ctx, true);
  }

  function restoreFromBranch(ctx: ExtensionContext) {
    // An explicit --tool-mode is a per-run instruction, so it outranks whatever
    // the session last persisted. Non-interactive callers rely on this to pin a
    // mode they can actually complete in.
    const requestedMode = parseMode(pi.getFlag("tool-mode") as string | undefined);
    if (requestedMode) {
      currentMode = requestedMode;
      autoTools = uniqueToolNames(pi.getActiveTools());
      applyModeTools(currentMode);
      setStatus(ctx);
      return;
    }

    let savedState: ToolModeState | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === "tool-mode") {
        savedState = entry.data as ToolModeState | undefined;
      }
    }

    currentMode = normalizeMode(savedState);
    if (savedState) {
      autoTools = savedState.autoTools?.length ? uniqueToolNames(savedState.autoTools) : undefined;
      applyModeTools(currentMode);
    } else {
      autoTools = uniqueToolNames(pi.getActiveTools());
    }

    setStatus(ctx);
  }

  pi.registerFlag("tool-mode", {
    description: "Start in a tool mode: auto (screened), write (unscreened), or read",
    type: "string",
    default: "",
  });

  pi.registerCommand("mode", {
    description: "Set tool mode: /mode auto|write|read",
    handler: async (args, ctx) => {
      const mode = (args ?? "").trim().toLowerCase();
      if (mode === "") {
        ctx.ui.notify(`Current mode: ${currentMode}`, "info");
        return;
      }
      if (mode !== "auto" && mode !== "write" && mode !== "read") {
        ctx.ui.notify("Usage: /mode auto|write|read", "warning");
        return;
      }
      setMode(mode, ctx, true);
    },
  });

  pi.registerCommand("read", {
    description: "Switch to read mode",
    handler: async (_args, ctx) => setMode("read", ctx, true),
  });

  pi.registerCommand("write", {
    description: "Switch to write mode (no screening)",
    handler: async (_args, ctx) => setMode("write", ctx, true),
  });

  pi.registerCommand("auto", {
    description: "Switch to auto mode (screened)",
    handler: async (_args, ctx) => setMode("auto", ctx, true),
  });

  pi.registerCommand("automode", {
    description: "Inspect the auto-mode screener: /automode [model <provider/id>]",
    handler: async (args, ctx) => {
      const argument = (args ?? "").trim();

      if (argument === "") {
        ctx.ui.notify(gate.describeConfig(ctx), "info");
        return;
      }

      const [subcommand, target] = argument.split(/\s+/, 2);
      const ref = subcommand === "model" && target ? parseModelRef(target) : undefined;
      if (!ref) {
        ctx.ui.notify("Usage: /automode [model <provider/id>]", "warning");
        return;
      }

      pinClassifierModel(ref.provider, ref.modelId);
      // The pin is process-local, so say where a lasting change belongs.
      ctx.ui.notify(
        `${gate.describeConfig(ctx)}\n\nPinned for this session only. Edit the config file to make it stick.`,
        "info",
      );
    },
  });

  pi.registerShortcut("shift+tab", {
    description: "Cycle tool mode (auto → write → read)",
    handler: async (ctx) => cycleMode(ctx),
  });

  pi.on("before_agent_start", async (event) => {
    if (currentMode === "read") {
      return { systemPrompt: `${event.systemPrompt}\n\n${READ_MODE_PROMPT}` };
    }

    const shellTool = activeShellTool();
    if (!shellTool) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildShellModePrompt(currentMode, shellTool)}`,
    };
  });

  pi.on("context", async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const candidate = message as { customType?: string };
        return candidate.customType !== "tool-mode-context";
      }),
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (currentMode === "read") {
      if (READ_TOOLS.includes(event.toolName)) return;

      return {
        block: true,
        reason: `Read mode blocks ${event.toolName}. Switch to write or auto mode to make changes.`,
      };
    }

    if (currentMode !== "auto") return;

    const decision = await gate.evaluate(
      { toolName: event.toolName, input: event.input as Record<string, unknown> },
      ctx,
    );

    if (decision.outcome === "allow") return;

    if (decision.outcome === "block") {
      return {
        block: true,
        reason: `Auto mode refused this call — ${decision.rule}: ${decision.rationale}`,
      };
    }

    const approved = await ctx.ui.confirm(
      `Auto mode: ${decision.rule}`,
      `${decision.rationale}\n\nRun \`${event.toolName}\` anyway?`,
    );

    if (approved) return;

    return {
      block: true,
      reason: `You declined this call — ${decision.rule}: ${decision.rationale}`,
    };
  });

  pi.on("user_bash", () => {
    if (currentMode !== "read") return;

    return {
      result: {
        output: "Read mode blocks user bash commands. Switch to write or auto mode first.",
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreFromBranch(ctx);
    await gate.captureBoundary(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreFromBranch(ctx);
    await gate.captureBoundary(ctx);
  });
}
