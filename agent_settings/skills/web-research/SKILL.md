---
name: web-research
description: Verify time-sensitive or externally-owned technical facts against primary sources. Use when judging whether an engineering number is plausible (bitrate, throughput, latency, IOPS, memory footprint), checking a cloud or hardware vendor's published limits, choosing between candidate libraries or tools, or confirming what the current de facto standard is in a toolchain. Also use for release dates, pricing, and policy changes. NOT for how-to-use API documentation of a known library — use context7 MCP for that.
---

# Web Research

## Routing

- Known library, need its API or config → context7 MCP, not this skill.
- Unknown answer that lives outside the repo, or a number someone asserted
  without a source → this skill.

## Rules

1. **Never answer from a WebSearch snippet.** Snippets strip the conditions
   that make a technical number true. WebFetch the primary source before
   stating any material claim.

2. **Quote numbers with their measurement conditions.** A bitrate is
   meaningless without resolution, fps, codec profile, and content motion.
   A disk throughput figure is meaningless without instance type, volume
   type, block size, and queue depth. Citing the number alone is a wrong
   answer even when the number is correct.

3. **Date every claim.** State the publication or effective date as an
   explicit date. Never write "latest", "recently", or "currently".

4. **When comparing candidate libraries, check liveness first.** Last
   release date, last commit, archived flag, open issue count. A library
   with a better API and no maintainer is the worse choice.

5. **Separate confirmed from inferred.** Confirmed = fetched a primary
   source and read the relevant passage. Everything else is inference and
   must be labeled as such.

6. **Cross-check independently** when the answer drives a purchase,
   a contract, a capacity plan, or an architecture commitment.

## Answer Shape

- Direct answer first
- The facts that support it, each with its conditions
- Source links
- What remains unverified
