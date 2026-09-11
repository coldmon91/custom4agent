/**
 * Pure type declarations for the ask_user tool.
 *
 * This module must stay free of external imports so that the state machine and
 * its tests run under `node --test` without installing any dependency.
 */

export interface AskUserOption {
	label: string;
	description?: string;
}

/** One question exactly as the model supplies it. */
export interface AskUserQuestionInput {
	header: string;
	question: string;
	multiSelect?: boolean;
	options: AskUserOption[];
}

export interface AskUserInput {
	questions: AskUserQuestionInput[];
}

/** A question after validation: internal id assigned and defaults applied. */
export interface NormalizedQuestion {
	id: string;
	header: string;
	question: string;
	multiSelect: boolean;
	options: AskUserOption[];
}

export interface SelectedOption {
	/** 1-based, identical to the number shortcut shown on screen. */
	index: number;
	label: string;
}

export interface AskUserAnswer {
	questionId: string;
	header: string;
	selected: SelectedOption[];
	customAnswer: string | null;
}

export interface AskUserResult {
	cancelled: boolean;
	answers: AskUserAnswer[];
}

/** Where the cursor sits inside the currently visible question. */
export type CursorTarget =
	| { kind: "option"; index: number }
	| { kind: "other" }
	| { kind: "submit" };

/**
 * What the caller must do after a key changed the state.
 * "edit" opens the free-text editor, "submit" finishes the questionnaire.
 */
export type ActivationOutcome = "none" | "edit" | "submit";

/**
 * Structural subset of the pi theme used by the renderer, so tests can pass a
 * plain stub instead of constructing a real Theme.
 */
export interface RenderTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
}
