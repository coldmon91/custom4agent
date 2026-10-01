# Pi Working Goal Display — Approved Design

Approved by the user on 2026-10-01 after the proposed design and examples.

## Purpose

The existing progress indicator shows lifecycle stages, elapsed time, and latest-event age.
A separate one-line widget adds the agent's stated current goal, in English.
The goal is self-reported intent, not proof of execution or an inference from tool activity.

## Display contract

During active TUI work, the widget appears above the editor and its existing progress border.
Its text is `Working on: <goal>`.
Until a valid goal arrives, it reads `Working on: Awaiting task summary`.
A terminal-width-aware renderer truncates the display to one line without changing stored text.

The last valid goal remains visible through tool calls, approval prompts, model waits, and turns.
A new task or active reload starts with the neutral fallback rather than reusing old goals.
Completion, cancellation, and shutdown remove the widget and clear its state.

## Source contract

A TUI-only prompt guideline asks the agent to begin visible commentary with
`Working on: <short English goal>` before tools at task start and when the subgoal changes.
The statement belongs in the same response as already-planned tool calls.
The extension does not request a continuation, add a status tool, or make a summarization API call.
The statement remains visible in the normal transcript as well as the widget.
The guideline adds a small prompt and output-token cost; model compliance is not guaranteed.

Only the first visible text line of an assistant message is eligible.
User messages, thinking, tool arguments, tool results, and provider payloads are never goal sources.
Streaming chunks are buffered until a complete line or the authoritative text-end event arrives.
Message-end text provides a fallback when normalized text deltas are absent.
Later lines, quoted examples, and other text blocks cannot replace the goal.

Goals are limited to 80 characters and 12 words, using plain English/ASCII text.
Terminal controls, paths, URLs, shell syntax, and obvious opaque credential-like strings are rejected.
The instruction excludes credentials and private details, but arbitrary semantic secrets cannot be
identified reliably; this is not a complete data-loss-prevention mechanism.
Invalid or missing statements do not replace the last valid goal or trigger fabricated summaries.

## Integration

`index.ts` owns lifecycle wiring, render deduplication, and cleanup.
`progress-state.ts` retains the existing stage and clock behavior unchanged.
`working-goal.ts` owns bounded first-line collection and validation.
`working-goal-prompt.ts` owns the added guideline and preserves other prompt sections.
`working-goal-widget.ts` owns single-line terminal rendering.
Tests remain colocated with the corresponding source files.

The guideline is appended to structured prompt rules without replacing existing instructions.
If an earlier extension supplied a forced full prompt, append the same guideline to that text,
preserving its original contents and avoiding duplicates.
Later full-prompt replacements are outside this extension's control.
RPC, JSON, and print modes receive neither prompt changes nor widgets or timers.
No model settings, permission logic, external services, dependencies, or durable state are changed.

## Verification criteria

- Streaming split boundaries and text-end/message-end fallback preserve correct goals.
- Unrelated text, thinking, user input, and tool data never populate the widget.
- Invalid statements, long output, and terminal controls remain bounded and safe.
- Goals survive turns and prompts but reset on new work and active reload.
- Completion, abort, repeated shutdown, and reload leave no widget or timer behind.
- Both forced and structured prompt paths preserve unrelated instructions.
- Narrow widths, resize, and themes preserve a single visible line.
- Existing extension tests, strict TypeScript checks, and the installed Pi loader pass.
- Reload is performed only on an idle target session; no unsolicited live model task is sent.
