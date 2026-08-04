# Reference

**Reference guides are technical descriptions of the machinery and how to operate it. Information-oriented.**

Reference holds *propositional* knowledge that a user consults while at **work**. Its only purpose is to describe, as succinctly as possible and in an orderly way.

Where tutorials and how-to guides are led by the needs of the user, **reference material is led by the product it describes**. For software, that means APIs, classes, functions, commands, options, and how to use them.

Users need reference because they need truth and certainty — firm platforms to stand on while they work. Good technical reference is what gives them the confidence to do that work.

## Reference as Description

Reference should be **austere**. One hardly *reads* it; one *consults* it. There should be no doubt or ambiguity — it must be wholly authoritative.

Reference is like a map: it tells you what you need to know about the territory without going out to check for yourself.

Although reference should not show how to perform tasks, it can and often must describe how something works or the correct way to use it.

Some reference (API documentation) can be generated from the software itself, which is a powerful way to keep it faithful to the code. But auto-generated reference is *not* all the documentation a product requires — a common and costly assumption among developers.

## Key Principles

### Describe and only describe

**Neutral description is the key imperative.** Style and form: austere and uncompromising; neutral, objective, factual; structured according to the structure of the machinery itself.

Describing something neutrally is one of the hardest things to do — it isn't a natural way of communicating. What comes naturally is to explain, instruct, discuss, and opine, and every one of those runs counter to what reference demands: accuracy, precision, completeness, clarity.

The temptation to add instruction and explanation comes from description seeming too thin to be useful — and we genuinely do need those things. **Link to how-to guides, explanation and tutorials instead.**

### Adopt standard patterns

**Reference is useful when it is consistent.** Standard patterns are what let people use reference effectively. Put what the user needs where they expect to find it, in a format they already know.

Writing offers many opportunities to delight readers with vocabulary and range of style. Reference material is definitely not one of them.

### Respect the structure of the machinery

**The structure of the documentation should mirror the structure of the product**, so the user can work through both at once. If a method belongs to a class that belongs to a module, the documentation should show the same relationship.

This doesn't mean forcing docs into an unnatural shape. What matters is that the logical arrangement of and relations within the code help make sense of the documentation.

### Provide examples

Examples illustrate without drifting into explanation or instruction. An example of a command's usage can convey it and its context succinctly, while still only describing.

## The Language of Reference

| Pattern | Purpose |
|---|---|
| *Django's default logging configuration inherits Python's defaults. It's available as `django.utils.log.DEFAULT_LOGGING` and defined in `django/utils/log.py`.* | State facts about the machinery and its behaviour |
| *Sub-commands are: a, b, c, d, e, f.* | List commands, options, operations, features, flags, limitations, error messages |
| *You must use a. You must not apply b unless c. Never d.* | Provide warnings where appropriate |

## Analogy

The information on a food packet. When you want relevant facts, you don't want opinions, speculation, instructions or interpretation. You expect them presented in standard ways so that nutritional properties, storage, ingredients and health implications are all findable fast and reliable — *May contain traces of wheat*; *Net weight: 1000g*.

You certainly don't expect recipes or marketing claims mixed in; that could be literally dangerous. This is important enough on food products to be governed by law, and the same seriousness should apply to all reference documentation.

---

Condensed from [Reference](https://diataxis.fr/reference/) — Diátaxis by Daniele Procida, CC BY-SA 4.0.
