import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ToolMode = "read" | "auto";

type PersistedMode = ToolMode | "plan" | "readonly";

interface ToolModeState {
  mode: PersistedMode;
  autoTools?: string[];
}

const READ_TOOLS = ["read", "grep", "find", "ls"];
const DEFAULT_AUTO_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const MODE_ORDER: ToolMode[] = ["auto", "read"];

function uniqueToolNames(toolNames: string[]): string[] {
  return [...new Set(toolNames)];
}

function normalizeMode(mode: PersistedMode | string | undefined): ToolMode {
  if (mode === "read") return "read";
  if (mode === "readonly") return "read";
  if (mode === "plan") return "read";
  return "auto";
}

export default function toolModeCycle(pi: ExtensionAPI) {
  let currentMode: ToolMode = "auto";
  let autoTools: string[] | undefined;

  function getFallbackAutoTools(): string[] {
    return uniqueToolNames(DEFAULT_AUTO_TOOLS);
  }

  function setStatus(ctx: ExtensionContext) {
    if (currentMode === "read") {
      ctx.ui.setStatus("tool-mode", "\x1b[38;5;71m● read\x1b[0m");
      return;
    }

    ctx.ui.setStatus("tool-mode", ctx.ui.theme.fg("success", "● auto"));
  }

  function persistState() {
    pi.appendEntry<ToolModeState>("tool-mode", {
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
    if (mode !== "auto" && currentMode === "auto") {
      autoTools = uniqueToolNames(pi.getActiveTools());
    }
    if (mode === "auto" && (!autoTools || autoTools.length === 0)) {
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
    const nextMode = MODE_ORDER[(index + 1) % MODE_ORDER.length] ?? "auto";
    setMode(nextMode, ctx, true);
  }

  function restoreFromBranch(ctx: ExtensionContext) {
    let savedState: ToolModeState | undefined;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === "tool-mode") {
        savedState = entry.data as ToolModeState | undefined;
      }
    }

    if (savedState) {
      currentMode = normalizeMode(savedState.mode);
      autoTools = savedState.autoTools?.length ? uniqueToolNames(savedState.autoTools) : undefined;
      applyModeTools(currentMode);
    } else {
      currentMode = "auto";
      autoTools = uniqueToolNames(pi.getActiveTools());
    }

    setStatus(ctx);
  }

  pi.registerCommand("mode", {
    description: "Set tool mode: /mode auto|read",
    handler: async (args, ctx) => {
      const mode = (args ?? "").trim().toLowerCase();
      if (mode === "") {
        ctx.ui.notify(`Current mode: ${currentMode}`, "info");
        return;
      }
      if (mode !== "auto" && mode !== "read") {
        ctx.ui.notify("Usage: /mode auto|read", "warning");
        return;
      }
      setMode(mode, ctx, true);
    },
  });

  pi.registerCommand("read", {
    description: "Switch to read mode",
    handler: async (_args, ctx) => setMode("read", ctx, true),
  });

  pi.registerCommand("auto", {
    description: "Switch to auto mode",
    handler: async (_args, ctx) => setMode("auto", ctx, true),
  });

  pi.registerShortcut("shift+tab", {
    description: "Cycle tool mode (auto ↔ read)",
    handler: async (ctx) => cycleMode(ctx),
  });

  pi.on("before_agent_start", async (event) => {
    if (currentMode !== "read") return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n[READ MODE]\nUse only read-only investigation. Do not propose or attempt file changes in this mode. If edits are needed, explain them without applying them.`,
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

  pi.on("tool_call", async (event) => {
    if (currentMode !== "read") return;
    if (READ_TOOLS.includes(event.toolName)) return;

    return {
      block: true,
      reason: `Read mode blocks ${event.toolName}. Switch to auto mode to make changes.`,
    };
  });

  pi.on("user_bash", () => {
    if (currentMode !== "read") return;

    return {
      result: {
        output: "Read mode blocks user bash commands. Switch to auto mode first.",
        exitCode: 1,
        cancelled: false,
        truncated: false,
      },
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });
}
