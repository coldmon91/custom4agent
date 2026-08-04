# Tutorials

**A tutorial is an experience under the guidance of a tutor. Learning-oriented.**

A practical activity in which the student learns by doing something meaningful toward an achievable goal.
It serves the user's **acquisition** of skill — their study. Its purpose is not to get something done; it is to let learning happen.

What the student *does* is not necessarily what they *learn*. Through doing, they pick up facts, familiarity, the names of things, tools, workflows, concepts, commands, and how those relate.

Software example: *Let's create a simple game in Python*. Real-world analogue: a driving lesson — the point is skill and confidence, not getting from A to B.

## The Contract

Nearly all responsibility falls on the teacher: what the pupil learns, what they do to learn it, and their success.
The pupil's only obligation is to follow directions attentively — never to learn, understand, or remember.

The exercise you put them through must be:

- **meaningful** — a sense of achievement
- **successful** — they can complete it
- **logical** — the path makes sense
- **usefully complete** — they encounter every action, concept and tool they need to become familiar with

## The Special Difficulty

The instructor is **required to be present but condemned to be absent**. You cannot watch the learner, correct mistakes, or check understanding.

Tutorials are also the most expensive documentation to maintain. Because the end-to-end journey must hold together, a single product change cascades through the whole story — unlike other doc types, where fixes are discrete.

And you must track two things at once: *what is to be learned* and *what is to be done*.

## Key Principles

**The first rule of teaching: don't try to teach.** Provide an experience through which the learner can learn, and trust that it will happen. Only your pupil can learn; you cannot learn for them.

Anti-pedagogical temptations: abstraction, generalisation, explanation, choices, information.

- **Show the learner where they'll be going.** *In this tutorial we will create and deploy a scalable web application. Along the way we will encounter containerisation tools.* Not *you will learn...* — presumptuous and a poor pattern.
- **Deliver visible results early and often.** Every step should produce a comprehensible, meaningful result, however small. Understanding comes from linking cause to effect rapidly and repeatedly.
- **Maintain a narrative of the expected.** At each step the user feels anxiety: will this work? Keep feeding back: "You will notice that...", "After a few moments, the server responds with...". Show actual or exact expected output. Flag likely failure signs: "If the output doesn't show ..., you have probably forgotten to ...". Prepare them for surprises: "This will probably print several hundred lines of logs."
- **Point out what the learner should notice.** A learner mid-task is too focused to observe. Close the learning loops by pointing things out in passing — how the command prompt changes, for example. Observing is an active skill, and it's often neglected.
- **Target the feeling of doing.** Skill flows in a confident rhythm and becomes a pleasure. Tie purpose and action together so that feeling has a cradle.
- **Encourage and permit repetition.** Learners re-run a step just to see the same thing happen again — it reaffirms that they can do it. Make steps repeatable wherever you can; irreversible operations make this hard.
- **Ruthlessly minimise explanation.** A tutorial is not the place for it. *We're using HTTPS because it's more secure* is enough; link to the discussion. Explanation is pertinent only when the *user* wants it — that isn't the author's call. This is the hardest temptation for a teacher to resist.
- **Focus on the concrete.** *This* problem, *this* action, *this* result. Minds are spectacular at perceiving general patterns from concrete examples; all learning moves from the particular toward the abstract, never the reverse.
- **Ignore options and alternatives.** Different flags, different API usages, different approaches — ignore them all. Stay on what's required to reach the conclusion. This keeps the tutorial crisp and saves cognitive work on both sides.
- **Aspire to perfect reliability.** Confidence is built layer by layer and easily shaken. A learner who follows directions and doesn't get the promised result loses faith in the tutorial, the tutor, and themselves. Your tutorial should work for every user, every time. You will not find all the flaws yourself — only extensive testing and watching real users will surface them.

## The Language of Tutorials

| Pattern | Purpose |
|---|---|
| *We ...* | First-person plural affirms the tutor–learner relationship: we're in this together |
| *In this tutorial, we will ...* | Describe what the learner will accomplish |
| *First, do x. Now, do y. Now that you have done y, do z.* | No room for ambiguity or doubt |
| *We must always do x before y because... (see Explanation for details)* | Minimal explanation in the most basic language, then link out |
| *The output should look something like ...* | Set clear expectations |
| *Notice that... Remember that... Let's check...* | Clues that confirm they're on the right track |
| *You have built a secure, three-layer stasis engine...* | Describe — and mildly admire — what they accomplished |

## Analogy

Teaching a child to cook. It doesn't matter what they make or how correctly. Value lies in what the child gains, not what they produce — that we wash hands before handling food, how to hold a knife, why the oil must be hot, what this utensil is called. They learn it by working alongside you, not from what you say or show. And if the lesson ends early but they achieved something small and enjoyed it, something real was laid down to build on next time.

---

Condensed from [Tutorials](https://diataxis.fr/tutorials/) — Diátaxis by Daniele Procida, CC BY-SA 4.0.
