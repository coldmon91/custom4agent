---
name: analysis-synthesis
description: When finishing review·analysis·investigation work, append a higher-level "종합 평가" (overall assessment) on top of the listed findings. Trigger at the final step of any task that reports analysis results to the user — code review, architecture/impact/root-cause analysis, log investigation, security audit, technical research, codebase comprehension, etc. Apply when the user requests things like "분석해줘", "검토해줘", "조사해줘", "리뷰해줘", "영향 파악해줘", "원인 찾아줘", or right before another analysis skill (analysis-program, analysis-root-cause, analysis-impact, analysis-architecture, analysis-log, security-audit, etc.) reports its findings. Do not trigger for output work like writing/running code or changing files, nor for simple fact lookups.
---

# Analysis Synthesis

Output from review·analysis·investigation work usually ends at "a list of findings".
This skill requires adding a **higher-level overall assessment** on top of that list.
The goal is not to re-summarize individual facts, but to **tie those facts into a single judgment** so the user can immediately know "so what's the conclusion, and how much can I trust it".

## When to apply

Apply at the **very last step** of work that reports analysis results to the user.

- Apply: code review, impact/side-effect analysis, root-cause analysis, architecture analysis, log investigation, security audit, technical/version research, codebase comprehension
- Don't apply: output work like writing/modifying/running code, single-fact lookups like "what's this function's signature"

Criterion: if the output **holds multiple findings** and the user must make a decision based on them, add the overall assessment.

## Output

Write the body (individual findings) as usual, then append the following block at the very end.

```
## 종합 평가

**핵심 결론:** (1 ~ 2문장. 발견 사항 전체를 관통하는 단 하나의 판단.)

**심각도:** 상 / 중 / 하 — (왜 그 등급인지 한 줄 근거.)

**분석 정확성:** 레벨 N/5, 확률 약 X% — (왜 그 레벨인지 한 줄 근거.)

**근거 한계:** (검증하지 못했거나 확인이 부족한 부분. 없으면 "없음"이라고 명시.)
```

Adjust the length to the scale of the analysis, but fill in all four items.

## Section guidance

### 핵심 결론 (required)

- It must be a **higher-level judgment tying findings together**, not a re-listing of individual findings.
  - Bad: "Found 3 bugs and 2 performance issues."
  - Good: "Works functionally, but concurrency handling relies on a single assumption and will break under load."
- If it can't be said in one sentence, the analysis hasn't reached a conclusion yet. Write that fact itself as the conclusion.

### 심각도 (required)

- Grade the overall level based on the **heaviest** finding.
- Simplify the grade to 상/중/하 and always attach a one-line rationale.
  - Data loss·security·operational outage possible → 상
  - Functional defect or maintenance burden but workaroundable → 중
  - Style·minor improvement → 하

### 분석 정확성 (required)

- Don't use assertive phrasing like "certain", "obvious", "X is the cause/problem". Always express conclusions as probability·likelihood.
- Grade on a 1 ~ 5 scale based on the **count** and **certainty** of evidence:
  1. Very low — 0 ~ 1 pieces of evidence, only circumstantial·indirect. Probability 20 ~ 40%
  2. Low — 1 ~ 2 pieces of evidence, many unverified assumptions. Probability 40 ~ 55%
  3. Moderate — directly confirmed 2+ pieces of evidence but some alternative explanations remain. Probability 55 ~ 75%
  4. High — multiple independent pieces of evidence agree (code+log/test results, etc.), most alternatives ruled out. Probability 75 ~ 90%
  5. Very high — reproduction·direct verification·regression check all done and rebuttal attempts failed. Probability 90%+ (don't express as 100% — residual uncertainty always remains)
- At level 3 or below, add a one-liner on "what more would raise the level".

### 근거 한계 (required)

- Honestly note areas this analysis **couldn't cover or confirm**.
- Don't write the unconfirmed as if confirmed. If you judge there are no limits, explicitly state "없음".

## Guardrails

- The overall assessment must rest on facts already stated in the body. Don't fabricate new claims for the assessment.
- Zero findings is also a conclusion — write "no problem within review scope" as the core conclusion and fill in analysis accuracy·evidence limits accordingly.
- Don't sugarcoat. Say a serious problem is serious via the grade.
- Match the user's language. If the request is in Korean, write in Korean.
