---
name: web-research
description: Research current information from the web with source-first verification and concise sourced outputs. Use when checking facts that may have changed, confirming product or API details, summarizing current events, verifying pricing, comparing tools or vendors, finding official documentation, or answering any request that benefits from links, dates, and explicit source attribution.
---

# Web Research

## Overview

Use this skill for web research that needs current, attributable answers.
Prioritize official sources, verify dates, and return a concise summary with links.

## Workflow

1. Decide whether the web is actually needed.
- Use local repository context first when the answer is already in the workspace.
- Use the web when the fact may have changed, when the user wants links or quotes, or when the answer depends on an external page, paper, policy, product, or release.

2. Plan the search.
- Read `references/query-strategy.md` when the search space is broad or unstable.
- Break the task into concrete facts to verify.
- Search narrowly before broadening the query.

3. Choose sources deliberately.
- Read `references/source-priority.md`.
- Prefer primary or official sources.
- For technical questions, prefer official docs, changelogs, specs, and primary repositories.
- For high-stakes topics, cross-check with an independent source.

4. Verify the timeline.
- Open the actual page before trusting the claim.
- Confirm publication, update, or effective dates.
- If the user uses relative dates such as "today" or "latest", translate them into explicit dates in the answer when helpful.

5. Write the answer with attribution.
- Read `references/output-format.md`.
- Start with the direct answer.
- Include links for material claims.
- Separate confirmed facts from inference.
- State uncertainty briefly when sources conflict or remain incomplete.

## Output Contract

Every response produced with this skill should do these things:

- Answer the user's question directly
- Name the effective or publication date when recency matters
- Cite the primary source when available
- Add one independent supporting source when the topic is high-stakes or contentious
- Keep the summary concise unless the user asks for depth

## Resources

- `references/query-strategy.md`: search planning and query design
- `references/source-priority.md`: source ranking and verification rules
- `references/output-format.md`: answer shape and attribution rules
