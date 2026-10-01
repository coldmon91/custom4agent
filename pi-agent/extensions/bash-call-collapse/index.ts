/**
 * Re-registers the built-in bash tool so a multi-line command collapses to its first line
 * until tool output is expanded (app.tools.expand, ctrl+o by default).
 * Execution and result rendering stay the built-in ones.
 */

import {
	createBashToolDefinition,
	getAgentDir,
	keyHint,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { collapseCommand } from "./collapse-command.ts";

type BashToolDefinition = ReturnType<typeof createBashToolDefinition>;

export default function bashCallCollapse(pi: ExtensionAPI): void {
	const builtin = createBashToolDefinition(process.cwd());
	const renderBuiltinCall = builtin.renderCall;
	if (!renderBuiltinCall) {
		throw new Error("bash-call-collapse: built-in bash tool has no renderCall to wrap");
	}

	let sessionBash: { cwd: string; tool: BashToolDefinition } | undefined;
	// Built once per cwd, like the built-in tool, so settings are not re-read on every call.
	const bashFor = (ctx: ExtensionContext): BashToolDefinition => {
		if (sessionBash?.cwd !== ctx.cwd) {
			sessionBash = { cwd: ctx.cwd, tool: createSessionBash(ctx) };
		}
		return sessionBash.tool;
	};

	pi.registerTool({
		...builtin,
		execute(toolCallId, params, signal, onUpdate, ctx) {
			return bashFor(ctx).execute(toolCallId, params, signal, onUpdate, ctx);
		},
		renderCall(args, theme, context) {
			const command = typeof args?.command === "string" ? args.command : undefined;
			if (context.expanded || command === undefined) {
				return renderBuiltinCall(args, theme, context);
			}
			const { firstLine, hiddenLineCount } = collapseCommand(command);
			if (hiddenLineCount === 0) {
				return renderBuiltinCall(args, theme, context);
			}
			const hint =
				theme.fg("muted", ` … (${hiddenLineCount} more lines, `) +
				keyHint("app.tools.expand", "to expand") +
				theme.fg("muted", ")");
			// Delegating keeps the built-in elapsed-time state and timeout suffix.
			return renderBuiltinCall({ ...args, command: firstLine + hint }, theme, context);
		},
	});
}

// Mirrors the shell options pi passes to its own bash tool (shellCommandPrefix, shellPath).
function createSessionBash(ctx: ExtensionContext): BashToolDefinition {
	const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
	return createBashToolDefinition(ctx.cwd, {
		commandPrefix: settings.getShellCommandPrefix(),
		shellPath: settings.getShellPath(),
	});
}
