import type { BeforeAgentStartEvent } from "@earendil-works/pi-coding-agent";

export const WORKING_GOAL_GUIDELINE =
  "Before using tools at task start and whenever your current subgoal changes, begin your visible response " +
  "with one plain line: Working on: <short English goal>. Use at most 12 words and 80 ASCII characters " +
  "for the goal, describing what you aim to accomplish rather than commands or execution claims. " +
  "Do not include paths, URLs, code, credentials, private details, or hidden reasoning. " +
  "Include this line in the same response as already-planned tool calls; do not add a tool call, " +
  "a separate status-only response, or an extra model request just to update it. " +
  "Keep all other response text in the user's preferred language.";

export function addWorkingGoalGuideline(event: BeforeAgentStartEvent): void {
  const options = event.systemPromptOptions;
  if (options.forceSystemPrompt !== undefined) {
    if (!options.forceSystemPrompt.includes(WORKING_GOAL_GUIDELINE)) {
      options.forceSystemPrompt += `\n\n${WORKING_GOAL_GUIDELINE}`;
    }
  } else if (!options.promptGuidelines.includes(WORKING_GOAL_GUIDELINE)) {
    options.promptGuidelines.push(WORKING_GOAL_GUIDELINE);
  }
}
