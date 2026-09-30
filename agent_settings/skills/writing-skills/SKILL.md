---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
---

# Writing Skills

## Overview

Writing a skill is Test-Driven Development applied to process documentation: run a scenario without the skill and watch the agent fail (RED), write the minimal skill that fixes those failures (GREEN), then close the loopholes the agent finds (REFACTOR).

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.

Personal skills live in the runtime's skills directory — `~/.claude/skills/` on Claude Code; Codex, Copilot CLI, and Gemini CLI also read `~/.agents/skills/`.

Official guidance: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

## When to Create a Skill

**Create when:**
- The technique wasn't intuitively obvious
- You'd reference it again across projects
- It applies broadly, not to one project

**Don't create for:**
- One-off solutions or narratives of how you solved something once
- Standard practices well-documented elsewhere
- Project-specific conventions (put them in the instructions file)
- Mechanical constraints — if regex or validation can enforce it, automate it

## Structure

```
skill-name/
  SKILL.md          # Required
  reference.md      # Only for heavy reference (100+ lines)
  script.*          # Only for reusable tools
```

Keep principles and code patterns under 50 lines inline. Link supporting files directly from SKILL.md, one level deep.

**Frontmatter:** `name` and `description` required, 1024 characters max ([spec](https://agentskills.io/specification)).
- `name`: letters, numbers, hyphens only; verb-first or gerund (`condition-based-waiting` over `async-test-helpers`)

**Body sections** (drop what doesn't apply):
1. Overview — core principle in 1-2 sentences
2. When to use — symptoms, and when NOT to use
3. Core pattern or steps
4. Quick reference — table or bullets for scanning
5. Common mistakes — what goes wrong + fix

## Writing the Description

The agent reads only the description to decide whether to load the skill. Write the trigger conditions, optionally followed by the scope in one clause. Third person, under 500 characters.

**Never summarize the procedure.** When a description summarized the workflow ("code review between tasks"), the agent followed the description and did one review, skipping the second review the body's flowchart required. With trigger conditions only, it read the body and did both.

```yaml
# ❌ Summarizes the procedure — the agent follows this instead of the body
description: Use when executing plans - dispatches subagent per task with code review between tasks

# ❌ Vague, no trigger
description: For async testing

# ✅ Trigger conditions only
description: Use when executing implementation plans with independent tasks in the current session

# ✅ Trigger + scope, no procedure
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently. Covers condition-based waiting and polling helpers.
```

- Describe the problem (race conditions), not language-specific symptoms (`setTimeout`), unless the skill is technology-specific — then name the technology
- Include words the agent would search for: error messages, symptoms, synonyms, tool names

## Keep It Short

SKILL.md loads in full whenever the skill triggers; every token competes with the task.
- Keep the body well under 500 lines; move heavy reference to a supporting file
- Point to `--help` instead of listing every flag
- Reference another skill by name instead of repeating it: `**REQUIRED SUB-SKILL:** Use writing-plans`. Never use `@path` links — they force-load the file immediately.
- One excellent, runnable example in the most relevant language — not several languages, not fill-in-the-blank templates
- Don't explain what the agent already knows

## Flowcharts

Use a small `dot` flowchart only for a non-obvious decision, a loop where the agent might stop too early, or an "A vs B" choice. Use numbered lists for linear steps, tables for reference, and code blocks for code. Node labels must carry meaning (no `step1`, `helper2`) and never contain code.

Style rules: `graphviz-conventions.dot`. To render a skill's flowcharts to SVG for a human: `./render-graphs.js ../some-skill [--combine]`.

## Match the Form to the Failure

Before writing guidance, classify the baseline failure. The form that bulletproofs one failure type measurably backfires on another.

| Baseline failure | Right form | Wrong form |
|---|---|---|
| Skips/violates a rule under pressure (knows better, does it anyway) | Prohibition + rationalization table + red flags (see Bulletproofing below) | Soft guidance ("prefer...", "consider...") |
| Complies, but output has the wrong shape (bloated prompt, buried verdict, restated spec) | Positive recipe or contract: state what the output IS — its parts, in order | Prohibition list ("don't restate", "never narrate") |
| Omits a required element from something they already produce | Structural: REQUIRED field or slot in the template they fill in | Prose reminders near the template |
| Behavior should depend on a condition | Conditional keyed to an observable predicate ("if the brief exists, reference it") | Unconditional rule + exemption clauses |

**Why prohibitions backfire on shaping problems:** under a competing incentive ("make the prompt self-contained"), agents negotiate with "don't X". In head-to-head wording tests on dispatch-prompt guidance, the prohibition arm produced clearly more of the unwanted content than the recipe arm (fully separated distributions), and trended worse than even the no-guidance control — micro-test your own case rather than assuming, but never reach for the prohibition by default. A recipe leaves nothing to negotiate: the output matches the stated shape or it doesn't.

**Rules for whichever form you pick:**
- **No nuance clauses.** "Don't X unless it matters" reopens the negotiation — appending a single nuance clause to a winning recipe degraded it from consistent to noisy in the same wording tests. Express a real exception as its own conditional on an observable predicate.
- **Exemption clauses don't scope.** "This limit doesn't apply to code blocks" still suppresses code blocks. If part of the output must be exempt, restructure so the rule can't reach it.

## Bulletproofing Discipline Skills

**Scope:** discipline failures only — an agent that knows the rule and skips it under pressure. For wrong-shaped output or omitted elements, use the forms above instead.

- **Close each loophole explicitly:** after the rule, list the specific workarounds it forbids ("Don't keep it as reference. Delete means delete.")
- **State early:** "Violating the letter of the rules is violating the spirit of the rules." — cuts off "spirit not letter" arguments
- **Rationalization table:** every excuse from testing, verbatim, with its counter
- **Red flags list:** the thoughts that mean "stop, you're about to violate"
- **Description:** add the about-to-violate symptoms to the triggers

**Tone by skill type:** discipline skills — firm authority ("No exceptions") plus commitment (force explicit choices, track checklists as todos); technique skills — moderate authority; reference skills — clarity only. Never use flattery or reciprocity to gain compliance.

Worked examples: [testing-skills-with-subagents.md](testing-skills-with-subagents.md).

## Testing

**Iron law: no skill, and no edit to a skill, without a failing test first.** Wrote or edited it before testing? Delete it and start over. This includes "simple additions" and "documentation updates".

1. **RED** — Run the scenario with a subagent WITHOUT the skill. Record choices and rationalizations verbatim.
2. **GREEN** — Write the minimal skill addressing those failures, nothing for hypothetical cases. Re-run WITH the skill; the agent should comply.
3. **REFACTOR** — New rationalization? Add an explicit counter and re-test until none remain.

**Test by skill type:**
- Discipline (rules): pressure scenarios combining 3+ pressures — passes when the agent complies under maximum pressure
- Technique (how-to): application to a new scenario and its edge cases — passes when applied correctly
- Pattern (mental model): recognition scenarios and counter-examples — passes when the agent knows when and when not to apply it
- Reference (docs/APIs): retrieval and application — passes when the agent finds and correctly uses the information

Pressure scenarios, pressure types, and meta-testing: [testing-skills-with-subagents.md](testing-skills-with-subagents.md).

### Micro-Test Wording Before Full Scenarios

Full pressure-scenario runs are the final gate, but they are slow and expensive per iteration. Verify the wording itself first with micro-tests:

1. **One fresh-context sample per call** — a raw API call, or a single-shot subagent if you don't have API access. System prompt = the realistic context the guidance will live in (the full skill or prompt template, not the guidance in isolation); user message = a task that tempts the failure.
2. **Always include a no-guidance control.** If the control doesn't exhibit the failure, there is nothing to fix — stop, don't author the guidance.
3. **5+ reps per variant.** Single samples lie.
4. **Manually read every flagged match.** Score programmatically if you like, but template echoes and quoted counter-examples masquerade as hits; automated counts alone overstate both failure and success.
5. **Variance is a metric.** When guidance lands, reps converge on the same shape. Five different interpretations across five reps means the wording isn't binding — tighten the form before adding words.

Micro-tests verify wording; they do not replace pressure scenarios for discipline skills.

## Checklist

Create a todo for each item. Finish and verify one skill before starting the next.

**RED**
- [ ] Baseline scenarios run WITHOUT the skill (3+ combined pressures for discipline skills)
- [ ] Failures and rationalizations recorded verbatim

**GREEN**
- [ ] `name` uses letters, numbers, hyphens only
- [ ] `description` states triggers (+ optional scope), third person, no procedure summary
- [ ] Addresses the specific baseline failures
- [ ] Guidance form matches the failure type
- [ ] Behavior-shaping wording micro-tested against a no-guidance control (5+ reps, every flagged match read) — N/A for pure reference skills
- [ ] Scenarios re-run WITH the skill; agent complies

**REFACTOR** (discipline skills)
- [ ] New rationalizations countered in the rules, rationalization table, and red flags
- [ ] Re-tested until no new rationalizations appear

**Quality**
- [ ] Body well under 500 lines; heavy parts in supporting files
- [ ] One excellent example; flowchart only for non-obvious decisions
- [ ] No narrative storytelling
