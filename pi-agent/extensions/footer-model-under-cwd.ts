import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { thinkingColor } from "./thinking-colors";

function formatCwd(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) return `~${cwd.slice(home.length)}`;
  return cwd;
}

function fmt(n: number): string {
  return n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
}

function layoutFooterLine(left: string, right: string, width: number): string {
  const rightWidth = visibleWidth(right);
  if (rightWidth >= width) return truncateToWidth(right, width);

  const maxLeftWidth = Math.max(0, width - rightWidth - 1);
  const trimmedLeft = truncateToWidth(left, maxLeftWidth);
  const padding = " ".repeat(Math.max(1, width - visibleWidth(trimmedLeft) - rightWidth));
  return `${trimmedLeft}${padding}${right}`;
}

export default function footerModelUnderCwd(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const offBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          if (typeof offBranch === "function") offBranch();
        },
        invalidate() {},
        render(width: number): string[] {
          let input = 0;
          let output = 0;
          let cacheRead = 0;
          let cacheWrite = 0;
          let cost = 0;

          for (const entry of ctx.sessionManager.getBranch()) {
            if (entry.type !== "message" || entry.message.role !== "assistant") continue;
            const msg = entry.message as AssistantMessage;
            input += msg.usage.input;
            output += msg.usage.output;
            cacheRead += msg.usage.cacheRead;
            cacheWrite += msg.usage.cacheWrite;
            cost += msg.usage.cost.total;
          }

          const usage = ctx.getContextUsage();
          const context = usage?.percent != null ? `ctx ${Math.round(usage.percent)}%` : "ctx ?";
          const cwd = formatCwd(ctx.cwd);
          const branch = footerData.getGitBranch();
          const sessionName = ctx.sessionManager.getSessionName?.();
          const statuses = [...footerData.getExtensionStatuses().values()].filter(Boolean);
          const pathLineLeft = theme.fg(
            "dim",
            `${cwd}${branch ? ` (${branch})` : ""}${sessionName ? ` · ${sessionName}` : ""}`,
          );
          const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model";
          const thinking = pi.getThinkingLevel();
          const modeStatus = statuses.length > 0 ? `${statuses.join(` ${theme.fg("dim", "·")} `)}  ` : "";
          const modelLineLeft = `${modeStatus}${theme.fg("accent", model)} ${theme.fg("dim", "· ")}${theme.fg(thinkingColor(thinking), thinking)}`;
          const modelLineRight = theme.fg(
            "dim",
            `${context} · ↑${fmt(input)} ↓${fmt(output)} R${fmt(cacheRead)} W${fmt(cacheWrite)} $${cost.toFixed(3)}`,
          );

          return [
            truncateToWidth(pathLineLeft, width),
            layoutFooterLine(modelLineLeft, modelLineRight, width),
          ];
        },
      };
    });
  });
}
