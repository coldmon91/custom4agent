/**
 * TypeBox input schema for the ask_user tool.
 *
 * Kept apart from `types.ts` so the state machine and its tests never pull in
 * typebox, which is only resolvable inside pi's runtime.
 */

import { Type } from "typebox";

export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 9;

const OptionSchema = Type.Object({
	label: Type.String({ description: "Short option text shown next to its number shortcut" }),
	description: Type.Optional(
		Type.String({ description: "Optional one-line explanation shown under the label" }),
	),
});

const QuestionSchema = Type.Object({
	header: Type.String({ description: "Short tab title, e.g. 'Scope', 'Database'" }),
	question: Type.String({ description: "The full question text shown to the user" }),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Allow more than one option to be picked (default: false)" }),
	),
	options: Type.Array(OptionSchema, {
		description: `Options to choose from, 1 to ${MAX_OPTIONS}`,
	}),
});

export const AskUserParams = Type.Object({
	questions: Type.Array(QuestionSchema, {
		description: `Related questions to ask at once, 1 to ${MAX_QUESTIONS}`,
	}),
});
