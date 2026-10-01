import assert from "node:assert/strict";
import { test } from "node:test";
import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";
import { addWorkingGoalGuideline, WORKING_GOAL_GUIDELINE } from "./working-goal-prompt.ts";

function promptEvent(forceSystemPrompt?: string): BeforeAgentStartEvent {
  return {
    type: "before_agent_start",
    prompt: "Check progress display",
    systemPrompt: "Existing system prompt",
    systemPromptOptions: {
      cwd: ".",
      forceSystemPrompt,
      promptGuidelines: ["Preserve existing permissions"],
      selectedTools: ["bash", "read"],
      toolSnippets: {},
      toolGuidelines: {},
      appendSystemPrompt: "",
      sections: { existing: "Existing extension instructions" },
      contextFiles: [],
      skills: [],
    },
  };
}

test("structured prompt rules gain one guideline without losing other instructions", () => {
  const event = promptEvent();
  const original = structuredClone(event.systemPromptOptions);
  addWorkingGoalGuideline(event);
  addWorkingGoalGuideline(event);
  assert.deepEqual(event.systemPromptOptions, {
    ...original,
    promptGuidelines: [...original.promptGuidelines, WORKING_GOAL_GUIDELINE],
  });
});

test("an existing forced prompt is preserved verbatim and extended only once", () => {
  const forced = "Existing system prompt\nRead-only mode: do not modify files";
  const event = promptEvent(forced);
  const original = structuredClone(event.systemPromptOptions);
  addWorkingGoalGuideline(event);
  addWorkingGoalGuideline(event);
  assert.deepEqual(event.systemPromptOptions, {
    ...original,
    forceSystemPrompt: `${forced}\n\n${WORKING_GOAL_GUIDELINE}`,
  });
});

test("a later forced prompt containing the rendered guideline is not duplicated", () => {
  const event = promptEvent();
  addWorkingGoalGuideline(event);
  event.systemPromptOptions.forceSystemPrompt =
    `${event.systemPromptOptions.promptGuidelines.join("\n")}\nShell mode rules`;
  const forced = event.systemPromptOptions.forceSystemPrompt;
  addWorkingGoalGuideline(event);
  assert.equal(event.systemPromptOptions.forceSystemPrompt, forced);
});
