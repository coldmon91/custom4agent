/**
 * ask_user - ask the user up to four multiple-choice questions from a tool call.
 *
 * Built on pi's `questionnaire.ts` example, extended with multi select,
 * number shortcuts, a global Submit button and missing-answer flags.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createQuestionnaireComponent } from "./questionnaire-component.ts";
import { AskUserParams, MAX_OPTIONS, MAX_QUESTIONS } from "./schema.ts";
import { renderAskUserCall, renderAskUserResult, summarizeAnswers } from "./tool-render.ts";
import type {
	AskUserAnswer,
	AskUserInput,
	AskUserResult,
	NormalizedQuestion,
	RenderTheme,
} from "./types.ts";

/**
 * Validates beyond the schema and assigns internal ids.
 * Throws so pi reports the call as a failed tool result.
 */
export function normalizeQuestions(input: AskUserInput): NormalizedQuestion[] {
	const questions = input.questions ?? [];
	if (questions.length < 1 || questions.length > MAX_QUESTIONS) {
		throw new Error(`ask_user expects 1 to ${MAX_QUESTIONS} questions, got ${questions.length}`);
	}

	const seenHeaders = new Set<string>();
	return questions.map((question, index) => {
		const position = index + 1;
		const header = (question.header ?? "").trim();
		const prompt = (question.question ?? "").trim();

		if (header === "") throw new Error(`ask_user question ${position} has an empty header`);
		if (prompt === "") throw new Error(`ask_user question ${position} has empty question text`);
		if (seenHeaders.has(header)) {
			throw new Error(`ask_user has a duplicate header "${header}"`);
		}
		seenHeaders.add(header);

		const options = question.options ?? [];
		if (options.length < 1 || options.length > MAX_OPTIONS) {
			throw new Error(
				`ask_user question "${header}" needs 1 to ${MAX_OPTIONS} options, got ${options.length}`,
			);
		}

		const seenLabels = new Set<string>();
		const normalizedOptions = options.map((option, optionIndex) => {
			const label = (option.label ?? "").trim();
			if (label === "") {
				throw new Error(`ask_user question "${header}" option ${optionIndex + 1} has an empty label`);
			}
			if (seenLabels.has(label)) {
				throw new Error(`ask_user question "${header}" has a duplicate option "${label}"`);
			}
			seenLabels.add(label);
			const description = option.description?.trim();
			return description ? { label, description } : { label };
		});

		return {
			id: `q${position}`,
			header,
			question: prompt,
			multiSelect: question.multiSelect === true,
			options: normalizedOptions,
		};
	});
}

export default function askUser(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user up to four multiple-choice questions and wait for the answers. " +
			"Each question shows numbered options plus an 'Other' row for free text, and can accept " +
			"a single choice or several. Use it when a decision is the user's to make.",
		parameters: AskUserParams,
		executionMode: "sequential",
		promptSnippet: "Ask the user up to four multiple-choice questions and receive the answers",
		promptGuidelines: [
			"Use ask_user when the user's choice would materially change the implementation direction or the result.",
			"Investigate the code and docs first; do not use ask_user for facts that are verifiable in the repository.",
			"Do not use ask_user for minor points that a safe default can cover.",
			"Group related questions into a single ask_user call, at most four.",
		],

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const questions = normalizeQuestions(params as AskUserInput);

			if (ctx.mode !== "tui") {
				throw new Error(`ask_user needs the interactive TUI; the current mode is "${ctx.mode}"`);
			}

			const answers = await ctx.ui.custom<AskUserAnswer[] | null>((tui, theme, _keybindings, done) =>
				createQuestionnaireComponent(questions, tui, theme as unknown as RenderTheme, done),
			);

			// RPC mode resolves custom() with undefined instead of showing the UI.
			if (answers === undefined) {
				throw new Error("ask_user could not display its UI in the current mode");
			}

			if (answers === null) {
				const cancelled: AskUserResult = { cancelled: true, answers: [] };
				return {
					content: [{ type: "text", text: "User cancelled the questions without answering." }],
					details: cancelled,
				};
			}

			const result: AskUserResult = { cancelled: false, answers };
			return {
				content: [{ type: "text", text: summarizeAnswers(answers) }],
				details: result,
			};
		},

		renderCall(args, theme) {
			return renderAskUserCall(args as Record<string, unknown>, theme as unknown as RenderTheme);
		},

		renderResult(result, _options, theme) {
			return renderAskUserResult(result, theme as unknown as RenderTheme);
		},
	});
}
