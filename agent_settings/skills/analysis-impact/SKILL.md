---
name: analysis-impact
description: "Analyze side effects of code changes. Use when the user asks to analyze side effects of code changes, check impact of modifications, review breaking changes, or assess risk of recent code changes. Responses in Korean."
---

# Review Impact

Analyze the side effects of the following changes.

## Analysis Items

1. **Direct dependencies**: files that import/call this code
2. **Indirect impact**: shared state, global variables, config changes
3. **Test impact**: related test cases
4. **API contract**: breaking changes from signature changes
5. **Type safety**: potential type mismatches

## Output Format

- High Risk: fix immediately
- Medium Risk: review recommended
- Low Risk: for reference
