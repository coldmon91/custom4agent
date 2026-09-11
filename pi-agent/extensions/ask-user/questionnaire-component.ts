/**
 * Key mapping and TUI rendering for the ask_user questionnaire.
 *
 * Key handling and rendering are exported separately from the component
 * factory so both can be verified without a terminal.
 */

import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import { QuestionnaireState } from "./questionnaire-state.ts";
import type { NormalizedQuestion, RenderTheme } from "./types.ts";

export const OTHER_LABEL = "Other";
const SUBMIT_LABEL = "[ Submit ]";

export interface KeyHooks {
	/** Open the free-text editor for the Other row. */
	startEdit(): void;
	/** Attempt a global submit; the state decides whether it succeeds. */
	submit(): void;
	/** Abandon the whole questionnaire. */
	cancel(): void;
}

/**
 * Routes one key press to the state machine.
 * Returns true when the key was consumed and a re-render is needed.
 */
export function handleQuestionnaireKey(
	state: QuestionnaireState,
	data: string,
	hooks: KeyHooks,
): boolean {
	if (matchesKey(data, Key.escape)) {
		hooks.cancel();
		return true;
	}

	if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
		state.nextTab();
		return true;
	}
	if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
		state.previousTab();
		return true;
	}
	if (matchesKey(data, Key.up)) {
		state.moveCursorUp();
		return true;
	}
	if (matchesKey(data, Key.down)) {
		state.moveCursorDown();
		return true;
	}

	if (/^[0-9]$/.test(data)) {
		applyOutcome(state.selectByNumber(Number(data)), hooks);
		return true;
	}

	if (matchesKey(data, Key.enter)) {
		applyOutcome(state.activateCursor("enter"), hooks);
		return true;
	}
	if (matchesKey(data, Key.space)) {
		applyOutcome(state.activateCursor("space"), hooks);
		return true;
	}

	return false;
}

function applyOutcome(outcome: "none" | "edit" | "submit", hooks: KeyHooks): void {
	if (outcome === "edit") {
		hooks.startEdit();
		return;
	}
	if (outcome === "submit") {
		hooks.submit();
	}
}

export interface RenderOptions {
	/** Lines produced by the free-text editor, shown while editing. */
	editorLines?: string[];
	/** Warning shown under the editor, e.g. after a blank submit. */
	warning?: string;
}

export function renderQuestionnaire(
	state: QuestionnaireState,
	theme: RenderTheme,
	width: number,
	options: RenderOptions = {},
): string[] {
	const renderWidth = Math.max(1, width);
	const lines: string[] = [];

	const push = (prefix: string, text: string): void => {
		const prefixWidth = visibleWidth(prefix);
		if (prefixWidth >= renderWidth) {
			lines.push(...wrapTextWithAnsi(prefix + text, renderWidth));
			return;
		}
		const wrapped = wrapTextWithAnsi(text, renderWidth - prefixWidth);
		const continuation = " ".repeat(prefixWidth);
		wrapped.forEach((line, index) => {
			lines.push(`${index === 0 ? prefix : continuation}${line}`);
		});
	};

	lines.push(theme.fg("accent", "─".repeat(renderWidth)));

	if (!state.isSingleQuestion) {
		push(" ", renderTabBar(state, theme));
		lines.push("");
	}

	const question = state.currentQuestion;
	push(" ", theme.fg("text", question.question));
	lines.push("");

	const target = state.cursorTarget();
	// Single select needs no checkbox: the green highlight carries the state.
	const marker = (checked: boolean): string =>
		question.multiSelect ? `${checkbox(checked)} ` : "";
	const rowColor = (checked: boolean, focused: boolean): string =>
		checked ? "success" : focused ? "accent" : "text";
	const descriptionIndent = question.multiSelect ? "       " : "     ";

	question.options.forEach((option, index) => {
		const focused = target.kind === "option" && target.index === index;
		const checked = state.isSelected(state.currentTabIndex, index);
		push(
			focused ? theme.fg("accent", "> ") : "  ",
			theme.fg(rowColor(checked, focused), `${marker(checked)}${index + 1}. ${option.label}`),
		);
		if (option.description) {
			push(descriptionIndent, theme.fg("muted", option.description));
		}
	});

	const otherFocused = target.kind === "other";
	const otherChecked = state.isOtherSelected();
	const otherText = state.otherTextOf();
	const otherSuffix = otherText === "" ? "" : `: ${otherText}`;
	push(
		otherFocused ? theme.fg("accent", "> ") : "  ",
		theme.fg(
			state.isEditing ? "accent" : rowColor(otherChecked, otherFocused),
			`${marker(otherChecked)}0. ${OTHER_LABEL}${otherSuffix}${state.isEditing ? " ✎" : ""}`,
		),
	);

	if (state.isEditing) {
		lines.push("");
		push(" ", theme.fg("muted", "Your answer:"));
		for (const line of options.editorLines ?? []) {
			lines.push(` ${line}`);
		}
		if (options.warning) {
			push(" ", theme.fg("warning", options.warning));
		}
		lines.push("");
		push(" ", theme.fg("dim", "Enter to save • Esc to discard"));
		lines.push(theme.fg("accent", "─".repeat(renderWidth)));
		return lines;
	}

	lines.push("");
	const submitFocused = target.kind === "submit";
	const submitReady = state.allAnswered();
	const submitText = submitFocused
		? theme.bg("selectedBg", theme.fg("text", SUBMIT_LABEL))
		: theme.fg(submitReady ? "success" : "dim", SUBMIT_LABEL);
	push(submitFocused ? theme.fg("accent", "> ") : "  ", submitText);

	lines.push("");
	push(" ", theme.fg("dim", helpText(state)));
	lines.push(theme.fg("accent", "─".repeat(renderWidth)));
	return lines;
}

function checkbox(checked: boolean): string {
	return checked ? "[v]" : "[ ]";
}

function renderTabBar(state: QuestionnaireState, theme: RenderTheme): string {
	return state.questions
		.map((question, index) => {
			const marker = state.isMissing(index) ? "!" : state.isAnswered(index) ? "v" : " ";
			const text = ` ${question.header} ${marker} `;
			if (index === state.currentTabIndex) {
				return theme.bg("selectedBg", theme.fg("text", text));
			}
			return theme.fg(state.isMissing(index) ? "warning" : "muted", text);
		})
		.join(" ");
}

function helpText(state: QuestionnaireState): string {
	const select = state.currentQuestion.multiSelect
		? "Space toggle • 1-9 toggle"
		: "Enter select • 1-9 select";
	const navigate = state.isSingleQuestion ? "↑↓ move" : "Tab/←→ tabs • ↑↓ move";
	return `${navigate} • ${select} • 0 other • Esc cancel`;
}

/**
 * Builds the component passed to `ctx.ui.custom()`.
 * `done` receives null when the user cancels.
 */
export function createQuestionnaireComponent(
	questions: NormalizedQuestion[],
	tui: TUI,
	theme: RenderTheme,
	done: (answers: ReturnType<QuestionnaireState["toAnswers"]> | null) => void,
) {
	const state = new QuestionnaireState(questions);
	const editor = new Editor(tui, editorTheme(theme));
	let cachedLines: string[] | undefined;
	let warning: string | undefined;

	const invalidate = (): void => {
		cachedLines = undefined;
	};

	const refresh = (): void => {
		invalidate();
		tui.requestRender();
	};

	const hooks: KeyHooks = {
		startEdit() {
			editor.setText(state.beginEdit());
			warning = undefined;
		},
		submit() {
			if (state.trySubmit()) {
				done(state.toAnswers());
			}
		},
		cancel() {
			done(null);
		},
	};

	editor.onSubmit = (value) => {
		if (state.commitEdit(value)) {
			editor.setText("");
			warning = undefined;
		} else {
			warning = "Enter a value or press Esc to discard";
		}
		refresh();
	};

	return {
		render(width: number): string[] {
			if (!cachedLines) {
				cachedLines = renderQuestionnaire(state, theme, width, {
					editorLines: state.isEditing ? editor.render(Math.max(1, width - 2)) : undefined,
					warning,
				});
			}
			return cachedLines;
		},
		invalidate,
		handleInput(data: string): void {
			if (state.isEditing) {
				if (matchesKey(data, Key.escape)) {
					state.cancelEdit();
					editor.setText("");
					warning = undefined;
				} else {
					editor.handleInput(data);
				}
				refresh();
				return;
			}
			if (handleQuestionnaireKey(state, data, hooks)) {
				refresh();
			}
		},
	};
}

function editorTheme(theme: RenderTheme): EditorTheme {
	return {
		borderColor: (text) => theme.fg("accent", text),
		selectList: {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		},
	};
}
