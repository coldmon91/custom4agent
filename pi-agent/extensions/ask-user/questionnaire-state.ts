/**
 * UI-independent state machine for the ask_user questionnaire.
 *
 * Cursor positions inside one question are laid out as
 * `0 .. n-1` options, `n` the Other row, `n + 1` the Submit button.
 */

import type {
	ActivationOutcome,
	AskUserAnswer,
	CursorTarget,
	NormalizedQuestion,
} from "./types.ts";

interface QuestionState {
	selected: Set<number>;
	otherText: string;
	otherSelected: boolean;
	cursor: number;
	missing: boolean;
}

export class QuestionnaireState {
	readonly questions: NormalizedQuestion[];
	private readonly states: QuestionState[];
	private tabIndex = 0;
	private editing = false;

	constructor(questions: NormalizedQuestion[]) {
		if (questions.length === 0) {
			throw new Error("QuestionnaireState requires at least one question");
		}
		this.questions = questions;
		this.states = questions.map(() => ({
			selected: new Set<number>(),
			otherText: "",
			otherSelected: false,
			cursor: 0,
			missing: false,
		}));
	}

	// --- read-only view -----------------------------------------------------

	get currentTabIndex(): number {
		return this.tabIndex;
	}

	get currentQuestion(): NormalizedQuestion {
		return this.questions[this.tabIndex];
	}

	get isEditing(): boolean {
		return this.editing;
	}

	get isSingleQuestion(): boolean {
		return this.questions.length === 1;
	}

	/** Cursor index of the Other row for the given question. */
	otherCursor(questionIndex = this.tabIndex): number {
		return this.questions[questionIndex].options.length;
	}

	/** Cursor index of the Submit button for the given question. */
	submitCursor(questionIndex = this.tabIndex): number {
		return this.questions[questionIndex].options.length + 1;
	}

	cursorOf(questionIndex = this.tabIndex): number {
		return this.states[questionIndex].cursor;
	}

	cursorTarget(questionIndex = this.tabIndex): CursorTarget {
		const cursor = this.states[questionIndex].cursor;
		if (cursor === this.submitCursor(questionIndex)) return { kind: "submit" };
		if (cursor === this.otherCursor(questionIndex)) return { kind: "other" };
		return { kind: "option", index: cursor };
	}

	isSelected(questionIndex: number, optionIndex: number): boolean {
		return this.states[questionIndex].selected.has(optionIndex);
	}

	isOtherSelected(questionIndex = this.tabIndex): boolean {
		return this.states[questionIndex].otherSelected;
	}

	otherTextOf(questionIndex = this.tabIndex): string {
		return this.states[questionIndex].otherText;
	}

	isMissing(questionIndex: number): boolean {
		return this.states[questionIndex].missing;
	}

	isAnswered(questionIndex: number): boolean {
		const state = this.states[questionIndex];
		return state.selected.size + (state.otherSelected ? 1 : 0) > 0;
	}

	allAnswered(): boolean {
		return this.questions.every((_, index) => this.isAnswered(index));
	}

	firstUnansweredIndex(): number {
		return this.questions.findIndex((_, index) => !this.isAnswered(index));
	}

	// --- navigation ---------------------------------------------------------

	nextTab(): void {
		this.moveTab(1);
	}

	previousTab(): void {
		this.moveTab(-1);
	}

	private moveTab(delta: number): void {
		if (this.isSingleQuestion) return;
		const onSubmit = this.cursorTarget().kind === "submit";
		const count = this.questions.length;
		this.tabIndex = (this.tabIndex + delta + count) % count;
		// The Submit button is global, so keep the cursor on it across tabs.
		if (onSubmit) {
			this.states[this.tabIndex].cursor = this.submitCursor();
		}
	}

	moveCursorUp(): void {
		const state = this.states[this.tabIndex];
		state.cursor = Math.max(0, state.cursor - 1);
	}

	moveCursorDown(): void {
		const state = this.states[this.tabIndex];
		state.cursor = Math.min(this.submitCursor(), state.cursor + 1);
	}

	// --- selection ----------------------------------------------------------

	/** Handle Space or Enter on the current cursor position. */
	activateCursor(key: "space" | "enter"): ActivationOutcome {
		if (this.editing) return "none";
		const target = this.cursorTarget();

		if (target.kind === "submit") {
			return key === "enter" ? "submit" : "none";
		}

		if (target.kind === "other") {
			if (this.currentQuestion.multiSelect && key === "space" && this.otherTextOf() !== "") {
				this.toggleOther();
				return "none";
			}
			return "edit";
		}

		this.chooseOption(target.index);
		return "none";
	}

	/** Handle a `1` ~ `9` option shortcut or `0` for the Other row. */
	selectByNumber(digit: number): ActivationOutcome {
		if (this.editing) return "none";
		const state = this.states[this.tabIndex];

		if (digit === 0) {
			state.cursor = this.otherCursor();
			return "edit";
		}

		const optionIndex = digit - 1;
		if (optionIndex >= this.currentQuestion.options.length) return "none";
		state.cursor = optionIndex;
		this.chooseOption(optionIndex);
		return "none";
	}

	private chooseOption(optionIndex: number): void {
		const state = this.states[this.tabIndex];
		if (this.currentQuestion.multiSelect) {
			if (state.selected.has(optionIndex)) {
				state.selected.delete(optionIndex);
			} else {
				state.selected.add(optionIndex);
			}
			this.refreshMissing(this.tabIndex);
			return;
		}

		state.selected = new Set([optionIndex]);
		state.otherSelected = false;
		this.refreshMissing(this.tabIndex);
		this.advanceAfterSingleAnswer();
	}

	private toggleOther(): void {
		const state = this.states[this.tabIndex];
		state.otherSelected = !state.otherSelected;
		this.refreshMissing(this.tabIndex);
	}

	// --- free-text editing --------------------------------------------------

	/** Enter edit mode; returns the existing text so the editor can prefill it. */
	beginEdit(): string {
		const state = this.states[this.tabIndex];
		state.cursor = this.otherCursor();
		this.editing = true;
		return state.otherText;
	}

	/** Returns false for a blank value, which keeps the editor open. */
	commitEdit(text: string): boolean {
		const trimmed = text.trim();
		if (trimmed === "") return false;

		const state = this.states[this.tabIndex];
		state.otherText = trimmed;
		state.otherSelected = true;
		if (!this.currentQuestion.multiSelect) {
			state.selected.clear();
		}
		this.editing = false;
		this.refreshMissing(this.tabIndex);
		if (!this.currentQuestion.multiSelect) {
			this.advanceAfterSingleAnswer();
		}
		return true;
	}

	cancelEdit(): void {
		this.editing = false;
	}

	// --- submission ---------------------------------------------------------

	/**
	 * Returns true when every question is answered. Otherwise flags the missing
	 * tabs and jumps to the first one.
	 */
	trySubmit(): boolean {
		if (this.allAnswered()) return true;

		this.questions.forEach((_, index) => {
			this.states[index].missing = !this.isAnswered(index);
		});
		const firstMissing = this.firstUnansweredIndex();
		if (firstMissing >= 0) {
			this.tabIndex = firstMissing;
			this.states[firstMissing].cursor = 0;
		}
		return false;
	}

	toAnswers(): AskUserAnswer[] {
		return this.questions.map((question, index) => {
			const state = this.states[index];
			const selected = [...state.selected]
				.sort((a, b) => a - b)
				.map((optionIndex) => ({
					index: optionIndex + 1,
					label: question.options[optionIndex].label,
				}));
			return {
				questionId: question.id,
				header: question.header,
				selected,
				customAnswer: state.otherSelected ? state.otherText : null,
			};
		});
	}

	// --- internals ----------------------------------------------------------

	/** Single select moves on by itself, so the last pick lands on Submit. */
	private advanceAfterSingleAnswer(): void {
		if (this.allAnswered()) {
			this.states[this.tabIndex].cursor = this.submitCursor();
			return;
		}
		const count = this.questions.length;
		for (let step = 1; step <= count; step++) {
			const candidate = (this.tabIndex + step) % count;
			if (!this.isAnswered(candidate)) {
				this.tabIndex = candidate;
				return;
			}
		}
	}

	private refreshMissing(questionIndex: number): void {
		if (this.isAnswered(questionIndex)) {
			this.states[questionIndex].missing = false;
		}
	}
}
