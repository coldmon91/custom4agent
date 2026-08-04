# How-to Guides

**How-to guides are directions that guide the reader through a problem or toward a result. Goal-oriented.**

A how-to guide helps the user get something done, correctly and safely. It guides their **action**, and it serves **work** — navigating from one side of a real-world problem-field to the other.

Good: *how to calibrate the radar array*; *how to use fixtures in pytest*; *how to configure reconnection back-off policies*. Also fine: *Troubleshooting deployment problems*.
Not a how-to: *how to build a web application* — that's an open-ended sphere of skill, not a specific goal.

The list of how-to guides frames what your product can actually *do*. A rich list is an encouraging suggestion of capability, and well-chosen how-to guides are usually the most-read part of a doc set.

## Addressed to Problems, Not to Tools

**Write from the perspective of the user, not the machinery.** Every how-to guide should answer to a human project: what the human needs to do, with the tools at hand, to get the result they need.

The prevailing anti-pattern defines how-to guides by operations the tool can perform — taking the machinery through its motions. It offers the user almost nothing, because it isn't addressed to any need they have.

Consider:

- "To shut off the flow of water, turn the tap clockwise."
- "To deploy the desired database configuration, select the appropriate options and press **Deploy**."

These *look* like guidance and aren't. They state what any competent practitioner already knows — standardised interfaces and general knowledge already make the effect of most actions obvious — and they're disconnected from purpose. What the user actually needs is how much water to run and how vigorously *for a given purpose*; which database options align with *particular real-world needs*.

This is a distinction of **meaningfulness**. Meaning comes from purpose and need. A machine's functionality has neither — it's just causes and effects.

Tools appear in how-to guides as incidental bit-players, means to the user's end. Sometimes an end aligns closely with one tool and the guide concentrates there; just as often a guide cuts across several tools, joined by what a human needs to get done. Either way, **the project defines the scope**.

## What How-to Guides Are Not

- **Not tutorials.** They're routinely confused, and conflating them is the root of many documentation problems. A tutorial serves study; a how-to guide serves work and addresses an already-competent user.
- **Not merely procedures.** Real-world problems don't always reduce to a linear sequence. Sequences can fork and overlap, with multiple entry and exit points, and a guide often needs the user to apply judgement.

## Key Principles

Maintain focus on the goal. Anything else dilutes the guide's useful power. The standing temptations are to explain, and to provide reference for completeness — neither is part of guiding work. **If they matter, link to them.**

- **Address real-world complexity.** A guide useless for anything except *exactly* your narrow case is rarely valuable. You can't cover every case, so stay open to the range of possibilities in a way the user can adapt.
- **Omit the unnecessary.** Practical usability beats completeness. Unlike a tutorial, a how-to guide need not be end-to-end: start and end somewhere reasonable and let the reader join it to their own work.
- **Provide a set of instructions.** A how-to guide is a contract in the form of an executable solution: *if you're in this situation, work through it with these steps.* "Actions" includes thinking and judgement, not just physical acts — address how the user thinks as well as what they do.
- **Describe a logical sequence.** There must be sense and meaning in the ordering. Often it's imposed by necessity (step two needs step one). Sometimes it's subtler: two operations may be possible in either order, but if one sets up the environment — or the user's thinking — for the other, put it first.
- **Seek flow.** Ground sequences in the patterns of the user's activity and thinking so the guide progresses smoothly. A workflow that keeps switching contexts and tools is clumsy; look deeper than that. What are you asking them to think about, and how does that thinking flow? How long must they hold a thought open before it resolves into action? Is jumping back to an earlier concern necessary or avoidable? Action has pace and rhythm, and badly-judged pace damages flow. At its best, a how-to guide *anticipates* the user — a helper who already has the tool you were reaching for.
- **Pay attention to naming.** The title must say exactly what the guide shows.
  - good: *How to integrate application performance monitoring*
  - bad: *Integrating application performance monitoring* — might be about whether you should
  - very bad: *Application performance monitoring* — might be *how*, *whether*, or just *what it is*

  Search engines appreciate good titles as much as humans do.

## The Language of How-to Guides

| Pattern | Purpose |
|---|---|
| *This guide shows you how to...* | State clearly the problem or task being solved |
| *If you want x, do y. To achieve w, do z.* | Conditional imperatives |
| *Refer to the x reference guide for a full list of options.* | Don't pollute a practical guide with every possibility |

## Analogy

A recipe. It defines what following it achieves and answers a specific question (*How do I make...?*). It isn't a recipe's job to *teach* — a professional chef still follows one, even their own, to get it right. But following a recipe requires basic competence: a recipe is no substitute for a cooking lesson. Someone expecting a recipe and handed a lesson will be annoyed, and the one moment you don't want the dish's history is while you're making it. A good recipe follows a well-established format that excludes both teaching and discussion.

---

Condensed from [How-to guides](https://diataxis.fr/how-to-guides/) — Diátaxis by Daniele Procida, CC BY-SA 4.0.
