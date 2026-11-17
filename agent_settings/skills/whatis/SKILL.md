---
name: whatis
description: "Explain an unfamiliar word, term, or sentence from the ongoing conversation in 1 ~ 2 sentences. Use when the user invokes /whatis with a term, or asks what a specific word/phrase in a previous answer means, without wanting a full explanation or research."
---

# What Is

Answer a single terminology question as briefly as possible.
Purpose: the user hit an unfamiliar word or sentence in a previous agent answer
and wants only that cleared up — not a lesson, not a document.

## Rules

- Answer in **1 ~ 2 sentences**. Never more.
- No headings, no bullet lists, no code blocks, no examples, no analogies-on-top-of-analogies.
- No preamble ("좋은 질문입니다", "설명드리면") and no closing offer of further help.
- No follow-up suggestions or next-step proposals.
- Keep the term in its original form (English identifiers, API names, jargon stay as-is);
  the explanation itself is Korean.
- Resolve the term from the **current conversation context first** — the user is almost
  always asking about a word that appeared in an earlier answer, so explain it
  in the sense it was used there, not in the abstract.
- **Do not use tools.** No file reads, no grep, no web search, no subagents.
  This command must add near-zero context.
- If the term is project-specific or genuinely unknown, do not guess.
  Say so in one sentence and ask whether to look it up — then stop.

## Input Handling

- Single word/term → what it is, in one sentence.
- Whole sentence → paraphrase it plainly in one or two sentences.
- No argument given → ask which word, in one line.

## Example

Input: `/whatis idempotent`

Output:
> 같은 요청을 여러 번 보내도 결과 상태가 한 번 보낸 것과 동일하게 유지되는 성질입니다.
