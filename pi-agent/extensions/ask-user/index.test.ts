import assert from "node:assert/strict";
import { test } from "node:test";

import askUser, { normalizeQuestions } from "./index.ts";
import type { AskUserAnswer, AskUserInput, AskUserResult } from "./types.ts";

interface CapturedTool {
	name: string;
	label: string;
	executionMode: string;
	promptSnippet: string;
	promptGuidelines: string[];
	execute: (
		id: string,
		params: unknown,
		signal: unknown,
		onUpdate: unknown,
		ctx: unknown,
	) => Promise<{ content: Array<{ type: string; text: string }>; details: AskUserResult }>;
}

function registerTool(): CapturedTool {
	let captured: CapturedTool | undefined;
	askUser({ registerTool: (tool: CapturedTool) => (captured = tool) } as never);
	assert.ok(captured, "the extension registers a tool");
	return captured;
}

function input(): AskUserInput {
	return {
		questions: [
			{ header: "Database", question: "Which database?", options: [{ label: "SQLite" }] },
		],
	};
}

/** Minimal ctx whose ui.custom resolves with a canned value. */
function context(mode: string, custom: unknown) {
	return { mode, ui: { custom: async () => custom } };
}

test("the tool is registered with sequential execution and prompt metadata", () => {
	const tool = registerTool();

	assert.equal(tool.name, "ask_user");
	assert.equal(tool.executionMode, "sequential");
	assert.ok(tool.promptSnippet.length > 0);
	for (const guideline of tool.promptGuidelines) {
		assert.match(guideline, /ask_user/, "every guideline names the tool");
	}
});

test("questions are normalized with internal ids and defaults", () => {
	const questions = normalizeQuestions({
		questions: [
			{
				header: "  Database  ",
				question: "  Which database?  ",
				options: [{ label: " SQLite ", description: "  embedded  " }],
			},
			{
				header: "Scope",
				question: "What is in scope?",
				multiSelect: true,
				options: [{ label: "API" }],
			},
		],
	});

	assert.deepEqual(questions[0], {
		id: "q1",
		header: "Database",
		question: "Which database?",
		multiSelect: false,
		options: [{ label: "SQLite", description: "embedded" }],
	});
	assert.equal(questions[1].id, "q2");
	assert.equal(questions[1].multiSelect, true);
});

test("invalid input is rejected", () => {
	assert.throws(() => normalizeQuestions({ questions: [] }), /1 to 4 questions/);

	assert.throws(
		() =>
			normalizeQuestions({
				questions: [{ header: " ", question: "Q", options: [{ label: "A" }] }],
			}),
		/empty header/,
	);

	assert.throws(
		() =>
			normalizeQuestions({
				questions: [
					{ header: "Same", question: "Q", options: [{ label: "A" }] },
					{ header: "Same", question: "Q", options: [{ label: "B" }] },
				],
			}),
		/duplicate header/,
	);

	assert.throws(
		() => normalizeQuestions({ questions: [{ header: "H", question: "Q", options: [] }] }),
		/1 to 9 options/,
	);

	assert.throws(
		() =>
			normalizeQuestions({
				questions: [{ header: "H", question: "Q", options: [{ label: "A" }, { label: "A" }] }],
			}),
		/duplicate option/,
	);
});

test("a non-TUI mode fails the tool call", async () => {
	const tool = registerTool();

	await assert.rejects(
		tool.execute("call-1", input(), null, null, context("print", null)),
		/needs the interactive TUI/,
	);
});

test("an undefined custom() result fails the tool call", async () => {
	const tool = registerTool();

	await assert.rejects(
		tool.execute("call-1", input(), null, null, context("tui", undefined)),
		/could not display its UI/,
	);
});

test("cancelling returns a normal result", async () => {
	const tool = registerTool();

	const result = await tool.execute("call-1", input(), null, null, context("tui", null));

	assert.deepEqual(result.details, { cancelled: true, answers: [] });
	assert.match(result.content[0].text, /cancelled/i);
});

test("answers are returned as text and structured details", async () => {
	const tool = registerTool();
	const answers: AskUserAnswer[] = [
		{
			questionId: "q1",
			header: "Database",
			selected: [{ index: 2, label: "SQLite" }],
			customAnswer: null,
		},
		{ questionId: "q2", header: "Scope", selected: [], customAnswer: "DuckDB" },
	];

	const result = await tool.execute("call-1", input(), null, null, context("tui", answers));

	assert.equal(result.details.cancelled, false);
	assert.deepEqual(result.details.answers, answers);
	assert.equal(result.content[0].text, "Database: selected: 2. SQLite\nScope: wrote: DuckDB");
});
