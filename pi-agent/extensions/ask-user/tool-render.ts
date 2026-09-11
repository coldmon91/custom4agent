/**
 * Transcript rendering for the ask_user tool call and its result.
 * Without these the call would show up as raw arguments.
 */

import { Text } from "@earendil-works/pi-tui";

import type { AskUserAnswer, AskUserResult, RenderTheme } from "./types.ts";

interface ToolResultLike {
	content: Array<{ type: string; text?: string }>;
	details?: unknown;
}

export function renderAskUserCall(args: Record<string, unknown>, theme: RenderTheme): Text {
	const questions = Array.isArray(args.questions) ? args.questions : [];
	const headers = questions
		.map((question) => (question as { header?: string }).header)
		.filter((header): header is string => typeof header === "string" && header !== "");

	let text = theme.fg("toolTitle", theme.bold("ask_user "));
	text += theme.fg("muted", `${questions.length} question${questions.length === 1 ? "" : "s"}`);
	if (headers.length > 0) {
		text += theme.fg("dim", ` (${headers.join(", ")})`);
	}
	return new Text(text, 0, 0);
}

export function renderAskUserResult(result: ToolResultLike, theme: RenderTheme): Text {
	const details = result.details as AskUserResult | undefined;
	if (!details) {
		const first = result.content[0];
		return new Text(first?.type === "text" ? (first.text ?? "") : "", 0, 0);
	}
	if (details.cancelled) {
		return new Text(theme.fg("warning", "Cancelled"), 0, 0);
	}
	return new Text(details.answers.map((answer) => answerLine(answer, theme)).join("\n"), 0, 0);
}

function answerLine(answer: AskUserAnswer, theme: RenderTheme): string {
	const parts = answer.selected.map((option) => `${option.index}. ${option.label}`);
	if (answer.customAnswer !== null) {
		parts.push(`${theme.fg("muted", "(wrote) ")}${answer.customAnswer}`);
	}
	return `${theme.fg("success", "✓ ")}${theme.fg("accent", answer.header)}: ${parts.join(", ")}`;
}

/** Plain-text summary so the model does not have to read `details`. */
export function summarizeAnswers(answers: AskUserAnswer[]): string {
	return answers
		.map((answer) => {
			const parts = answer.selected.map((option) => `selected: ${option.index}. ${option.label}`);
			if (answer.customAnswer !== null) {
				parts.push(`wrote: ${answer.customAnswer}`);
			}
			return `${answer.header}: ${parts.join(" | ")}`;
		})
		.join("\n");
}
