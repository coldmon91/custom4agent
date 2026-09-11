import assert from "node:assert/strict";
import { test } from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";

import { handleQuestionnaireKey, renderQuestionnaire } from "./questionnaire-component.ts";
import { QuestionnaireState } from "./questionnaire-state.ts";
import type { KeyHooks } from "./questionnaire-component.ts";
import type { NormalizedQuestion, RenderTheme } from "./types.ts";

/** Passes text through untouched so assertions can match plain strings. */
const plainTheme: RenderTheme = {
	fg: (_color, text) => text,
	bg: (_color, text) => text,
	bold: (text) => text,
};

function question(
	id: string,
	labels: string[],
	multiSelect = false,
	description?: string,
): NormalizedQuestion {
	return {
		id,
		header: id.toUpperCase(),
		question: `Question ${id}?`,
		multiSelect,
		options: labels.map((label, index) => ({
			label,
			description: index === 0 ? description : undefined,
		})),
	};
}

function recordingHooks(): KeyHooks & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		startEdit: () => calls.push("startEdit"),
		submit: () => calls.push("submit"),
		cancel: () => calls.push("cancel"),
	};
}

const ESC = "\x1b";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const TAB = "\t";
const SHIFT_TAB = "\x1b[Z";
const ENTER = "\r";
const SPACE = " ";

test("arrow and tab keys drive navigation", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"]), question("q2", ["C", "D"])]);
	const hooks = recordingHooks();

	assert.equal(handleQuestionnaireKey(state, DOWN, hooks), true);
	assert.deepEqual(state.cursorTarget(), { kind: "option", index: 1 });
	handleQuestionnaireKey(state, UP, hooks);
	assert.deepEqual(state.cursorTarget(), { kind: "option", index: 0 });

	handleQuestionnaireKey(state, TAB, hooks);
	assert.equal(state.currentTabIndex, 1);
	handleQuestionnaireKey(state, SHIFT_TAB, hooks);
	assert.equal(state.currentTabIndex, 0);
	handleQuestionnaireKey(state, RIGHT, hooks);
	assert.equal(state.currentTabIndex, 1);
	handleQuestionnaireKey(state, LEFT, hooks);
	assert.equal(state.currentTabIndex, 0);

	assert.deepEqual(hooks.calls, []);
});

test("number keys select and `0` opens the editor", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B", "C"], true)]);
	const hooks = recordingHooks();

	handleQuestionnaireKey(state, "2", hooks);
	assert.equal(state.isSelected(0, 1), true);

	handleQuestionnaireKey(state, "2", hooks);
	assert.equal(state.isSelected(0, 1), false, "number keys toggle in multi select");

	handleQuestionnaireKey(state, "0", hooks);
	assert.deepEqual(hooks.calls, ["startEdit"]);
	assert.deepEqual(state.cursorTarget(), { kind: "other" });
});

test("Space toggles and Enter on Submit triggers submission", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"], true)]);
	const hooks = recordingHooks();

	handleQuestionnaireKey(state, SPACE, hooks);
	assert.equal(state.isSelected(0, 0), true);

	// options + Other + Submit
	handleQuestionnaireKey(state, DOWN, hooks);
	handleQuestionnaireKey(state, DOWN, hooks);
	handleQuestionnaireKey(state, DOWN, hooks);
	assert.deepEqual(state.cursorTarget(), { kind: "submit" });

	handleQuestionnaireKey(state, SPACE, hooks);
	assert.deepEqual(hooks.calls, [], "Space on Submit does nothing");

	handleQuestionnaireKey(state, ENTER, hooks);
	assert.deepEqual(hooks.calls, ["submit"]);
});

test("Escape cancels the questionnaire", () => {
	const state = new QuestionnaireState([question("q1", ["A"])]);
	const hooks = recordingHooks();

	assert.equal(handleQuestionnaireKey(state, ESC, hooks), true);
	assert.deepEqual(hooks.calls, ["cancel"]);
});

test("unknown keys are not consumed", () => {
	const state = new QuestionnaireState([question("q1", ["A"])]);

	assert.equal(handleQuestionnaireKey(state, "x", recordingHooks()), false);
});

test("checkboxes reflect the selection state", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"], true)]);
	state.selectByNumber(2);

	const output = renderQuestionnaire(state, plainTheme, 60).join("\n");

	assert.match(output, /\[ \] 1\. A/);
	assert.match(output, /\[v\] 2\. B/);
	assert.match(output, /\[ \] 0\. Other/);
});

test("single select renders a plain numbered list without checkboxes", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"])]);

	const output = renderQuestionnaire(state, plainTheme, 60).join("\n");

	assert.doesNotMatch(output, /\[ \]|\[v\]/);
	assert.match(output, /1\. A/);
	assert.match(output, /2\. B/);
	assert.match(output, /0\. Other/);
});

test("the selected row is highlighted in green", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"])]);
	const theme: RenderTheme = {
		fg: (color, text) => `<${color}>${text}`,
		bg: (color, text) => `<${color}>${text}`,
		bold: (text) => text,
	};

	state.selectByNumber(2);
	const output = renderQuestionnaire(state, theme, 60).join("\n");

	assert.match(output, /<success>2\. B/);
	assert.doesNotMatch(output, /<success>1\. A/, "unselected rows keep the normal color");
});

test("Other shows its stored text", () => {
	const state = new QuestionnaireState([question("q1", ["A"], true)]);
	state.beginEdit();
	state.commitEdit("DuckDB");
	state.cancelEdit();

	const output = renderQuestionnaire(state, plainTheme, 60).join("\n");

	assert.match(output, /\[v\] 0\. Other: DuckDB/);
});

test("the tab bar marks answered and missing questions", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"]), question("q2", ["C", "D"])]);
	state.nextTab();
	state.selectByNumber(1); // answers q2, jumps back to q1
	state.trySubmit();

	const output = renderQuestionnaire(state, plainTheme, 80).join("\n");

	assert.match(output, /Q1 !/, "unanswered question is flagged after a submit attempt");
	assert.match(output, /Q2 v/, "answered question is ticked");
});

test("a single question renders without a tab bar", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"])]);

	const output = renderQuestionnaire(state, plainTheme, 60).join("\n");

	assert.doesNotMatch(output, /Q1/);
	assert.match(output, /\[ Submit \]/);
	assert.match(output, /↑↓ move • Enter select/);
});

test("Submit is only styled as ready once every question is answered", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"])]);
	const theme: RenderTheme = {
		fg: (color, text) => `<${color}>${text}`,
		bg: (color, text) => `<${color}>${text}`,
		bold: (text) => text,
	};

	assert.match(renderQuestionnaire(state, theme, 60).join("\n"), /<dim>\[ Submit \]/);

	state.selectByNumber(1);
	const answered = renderQuestionnaire(state, theme, 60).join("\n");
	assert.match(answered, /<selectedBg>/, "the cursor lands on Submit and highlights it");
});

test("every rendered line fits a narrow terminal", () => {
	const state = new QuestionnaireState([
		question("q1", ["A very long option label that will not fit", "B"], true, "A long description"),
		question("q2", ["C"], false),
	]);

	for (const width of [12, 20, 40]) {
		for (const line of renderQuestionnaire(state, plainTheme, width)) {
			assert.ok(
				visibleWidth(line) <= width,
				`line "${line}" exceeds width ${width} (${visibleWidth(line)})`,
			);
		}
	}
});
