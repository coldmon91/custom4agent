import assert from "node:assert/strict";
import { test } from "node:test";

import { QuestionnaireState } from "./questionnaire-state.ts";
import type { NormalizedQuestion } from "./types.ts";

function question(
	id: string,
	labels: string[],
	multiSelect = false,
): NormalizedQuestion {
	return {
		id,
		header: id.toUpperCase(),
		question: `Question ${id}?`,
		multiSelect,
		options: labels.map((label) => ({ label })),
	};
}

function singleSelect(): QuestionnaireState {
	return new QuestionnaireState([question("q1", ["A", "B", "C"])]);
}

function multiSelect(): QuestionnaireState {
	return new QuestionnaireState([question("q1", ["A", "B", "C"], true)]);
}

test("single select replaces the previous answer", () => {
	const state = singleSelect();

	state.selectByNumber(1);
	state.selectByNumber(3);

	assert.equal(state.isSelected(0, 0), false);
	assert.equal(state.isSelected(0, 2), true);
	assert.deepEqual(state.toAnswers()[0].selected, [{ index: 3, label: "C" }]);
});

test("single select advances to the next unanswered tab", () => {
	const state = new QuestionnaireState([
		question("q1", ["A", "B"]),
		question("q2", ["C", "D"]),
		question("q3", ["E", "F"]),
	]);

	state.selectByNumber(1);
	assert.equal(state.currentTabIndex, 1);

	state.nextTab(); // skip q2 for now
	assert.equal(state.currentTabIndex, 2);
	state.selectByNumber(2);

	// q3 answered, so the only unanswered tab left is q2.
	assert.equal(state.currentTabIndex, 1);
});

test("answering the last question moves the cursor to Submit", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"]), question("q2", ["C", "D"])]);

	state.selectByNumber(1);
	state.selectByNumber(2);

	assert.equal(state.allAnswered(), true);
	assert.deepEqual(state.cursorTarget(), { kind: "submit" });
});

test("multi select toggles with Space and with number keys", () => {
	const state = multiSelect();

	state.selectByNumber(2);
	assert.equal(state.isSelected(0, 1), true);
	assert.equal(state.currentTabIndex, 0, "multi select stays on the same tab");

	state.moveCursorDown(); // cursor on option C
	state.moveCursorDown();
	state.moveCursorUp();
	assert.deepEqual(state.cursorTarget(), { kind: "option", index: 2 });
	state.activateCursor("space");
	assert.equal(state.isSelected(0, 2), true);
});

test("multi select deselects an already selected option", () => {
	const state = multiSelect();

	state.selectByNumber(1);
	state.selectByNumber(1);

	assert.equal(state.isSelected(0, 0), false);
	assert.equal(state.isAnswered(0), false);
});

test("multi select Other deselects and reselects the preserved text", () => {
	const state = multiSelect();

	state.beginEdit();
	assert.equal(state.commitEdit("  DuckDB  "), true);
	assert.equal(state.isOtherSelected(), true);
	assert.equal(state.otherTextOf(), "DuckDB");

	state.activateCursor("space");
	assert.equal(state.isOtherSelected(), false);
	assert.equal(state.otherTextOf(), "DuckDB", "text survives deselection");
	assert.equal(state.toAnswers()[0].customAnswer, null);

	state.activateCursor("space");
	assert.equal(state.isOtherSelected(), true);
	assert.equal(state.isEditing, false);
});

test("multi select keeps a regular option and Other at the same time", () => {
	const state = multiSelect();

	state.selectByNumber(1);
	state.beginEdit();
	state.commitEdit("DuckDB");

	const answer = state.toAnswers()[0];
	assert.deepEqual(answer.selected, [{ index: 1, label: "A" }]);
	assert.equal(answer.customAnswer, "DuckDB");
});

test("single select Other replaces the regular selection", () => {
	const state = singleSelect();

	state.selectByNumber(1);
	state.beginEdit();
	state.commitEdit("DuckDB");

	const answer = state.toAnswers()[0];
	assert.deepEqual(answer.selected, []);
	assert.equal(answer.customAnswer, "DuckDB");
});

test("a blank Other value is rejected and keeps edit mode", () => {
	const state = singleSelect();

	state.beginEdit();
	assert.equal(state.commitEdit("   "), false);
	assert.equal(state.isEditing, true);
	assert.equal(state.isAnswered(0), false);
});

test("editing an existing Other value can be cancelled", () => {
	const state = singleSelect();

	state.beginEdit();
	state.commitEdit("DuckDB");

	assert.equal(state.beginEdit(), "DuckDB", "prefills the current value");
	state.cancelEdit();

	assert.equal(state.isEditing, false);
	assert.equal(state.otherTextOf(), "DuckDB");
	assert.equal(state.toAnswers()[0].customAnswer, "DuckDB");
});

test("tabs cycle and keep their own selection and cursor", () => {
	const state = new QuestionnaireState([
		question("q1", ["A", "B"], true),
		question("q2", ["C", "D"], true),
	]);

	state.selectByNumber(2); // q1 option B, cursor lands on index 1
	state.nextTab();
	assert.equal(state.currentTabIndex, 1);
	assert.deepEqual(state.cursorTarget(), { kind: "option", index: 0 });

	state.nextTab();
	assert.equal(state.currentTabIndex, 0, "tab navigation wraps around");
	assert.equal(state.isSelected(0, 1), true);
	assert.deepEqual(state.cursorTarget(), { kind: "option", index: 1 });
});

test("the cursor stays on Submit while tabs change", () => {
	const state = new QuestionnaireState([question("q1", ["A", "B"]), question("q2", ["C", "D", "E"])]);

	state.moveCursorDown();
	state.moveCursorDown();
	state.moveCursorDown();
	assert.deepEqual(state.cursorTarget(), { kind: "submit" });

	state.nextTab();
	assert.equal(state.currentTabIndex, 1);
	assert.deepEqual(state.cursorTarget(), { kind: "submit" });
	assert.equal(state.cursorOf(), 4, "Submit sits below three options and Other");
});

test("tab navigation is inert for a single question", () => {
	const state = singleSelect();

	state.nextTab();
	state.previousTab();

	assert.equal(state.currentTabIndex, 0);
	assert.equal(state.isSingleQuestion, true);
});

test("submitting while incomplete flags the missing tabs and jumps to the first", () => {
	const state = new QuestionnaireState([
		question("q1", ["A", "B"]),
		question("q2", ["C", "D"]),
		question("q3", ["E", "F"]),
	]);

	state.nextTab();
	state.nextTab();
	state.selectByNumber(1); // answers q3 only

	assert.equal(state.trySubmit(), false);
	assert.equal(state.isMissing(0), true);
	assert.equal(state.isMissing(1), true);
	assert.equal(state.isMissing(2), false);
	assert.equal(state.currentTabIndex, 0);

	state.selectByNumber(1);
	assert.equal(state.isMissing(0), false, "answering clears the flag");
});

test("a complete questionnaire serializes answers with their shortcut index", () => {
	const state = new QuestionnaireState([
		question("q1", ["A", "B", "C"]),
		question("q2", ["X", "Y"], true),
	]);

	state.selectByNumber(2);
	assert.equal(state.currentTabIndex, 1);
	state.selectByNumber(1);
	state.selectByNumber(2);
	state.beginEdit();
	state.commitEdit("Z");

	assert.equal(state.trySubmit(), true);
	assert.deepEqual(state.toAnswers(), [
		{
			questionId: "q1",
			header: "Q1",
			selected: [{ index: 2, label: "B" }],
			customAnswer: null,
		},
		{
			questionId: "q2",
			header: "Q2",
			selected: [
				{ index: 1, label: "X" },
				{ index: 2, label: "Y" },
			],
			customAnswer: "Z",
		},
	]);
});
