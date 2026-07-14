# Analysis notes

This skill is intentionally conservative.

## Confidence guideline
- High: explicit project-local entry point and direct caller chain exist.
- Medium: entry point exists, but one or more hops require framework registration or interface dispatch.
- Low: final reachability depends on reflection, string-based dispatch, plugin loading, generated code, or unresolved dynamic behavior.

## Dead-code guideline
Treat code as likely dead only when the project-local evidence is strong. Typical examples:
- no references at all
- no path from any in-project entry point
- compile-time or feature-flag guards appear to disable it everywhere in-repo
- only referenced from tests, examples, or commented-out code

## Scope guideline
Do not infer behavior from external services, production dashboards, or infrastructure unless that logic is encoded in the current repository.
