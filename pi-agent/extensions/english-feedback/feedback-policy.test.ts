import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MAX_FEEDBACK_INPUT_LENGTH,
  maskBacktickSegments,
  parseFeedbackResponse,
  prepareFeedbackInput,
  type FeedbackPlaceholder,
} from "./feedback-policy.ts";

function response(feedback: string | null): string {
  return JSON.stringify({ feedback });
}

describe("prepareFeedbackInput", () => {
  test("rejects blank input, standalone URLs, and standalone paths", () => {
    assert.equal(prepareFeedbackInput("  \n"), null);
    assert.equal(prepareFeedbackInput("https://example.com/file.ts"), null);
    assert.equal(prepareFeedbackInput("./src/index.ts"), null);
    assert.equal(prepareFeedbackInput("C:\\src\\index.ts"), null);
  });

  test("keeps Korean and English natural-language input", () => {
    assert.equal(prepareFeedbackInput("이 함수를 확인해줘")?.modelInput, "이 함수를 확인해줘");
    assert.equal(
      prepareFeedbackInput("Please check this function.")?.modelInput,
      "Please check this function.",
    );
  });

  test("masks inline code without sending its contents", () => {
    const prepared = prepareFeedbackInput("`parse()`가 입력을 처리하는지 확인해줘");

    assert.ok(prepared);
    assert.equal(prepared.placeholders.length, 1);
    assert.equal(prepared.placeholders[0].kind, "inline");
    assert.equal(prepared.placeholders[0].original, "`parse()`");
    assert.ok(prepared.modelInput.includes(prepared.placeholders[0].token));
    assert.ok(!prepared.modelInput.includes("parse()"));
  });

  test("masks fenced code without sending its contents", () => {
    const prepared = prepareFeedbackInput("다음 코드를 검토해줘\n```ts\nconst secret = 1;\n```");

    assert.ok(prepared);
    assert.equal(prepared.placeholders.length, 1);
    assert.equal(prepared.placeholders[0].kind, "block");
    assert.ok(!prepared.modelInput.includes("secret"));
  });

  test("rejects input containing only backtick code", () => {
    assert.equal(prepareFeedbackInput("`parse()`"), null);
    assert.equal(prepareFeedbackInput("```ts\nconst value = 1;\n```"), null);
  });

  test("evaluates short prose around a large fenced code block", () => {
    const input = `이 코드를 검토해줘\n\`\`\`txt\n${"x".repeat(20_000)}\n\`\`\``;
    const prepared = prepareFeedbackInput(input);

    assert.ok(prepared);
    assert.ok(prepared.modelInput.length < 100);
  });

  test("applies the length limit after masking", () => {
    assert.equal(prepareFeedbackInput("가".repeat(MAX_FEEDBACK_INPUT_LENGTH + 1)), null);
  });

  test("keeps unmatched backticks as ordinary text", () => {
    const input = "이 `코드는 닫히지 않았어";
    const prepared = prepareFeedbackInput(input);

    assert.ok(prepared);
    assert.equal(prepared.modelInput, input);
    assert.deepEqual(prepared.placeholders, []);
  });

  test("avoids placeholder collisions with input text", () => {
    const masked = maskBacktickSegments("<INLINE_CODE_1>과 `value`를 확인해줘");

    assert.equal(masked.placeholders[0].token, "<INLINE_CODE_2>");
  });
});

describe("parseFeedbackResponse", () => {
  const inlinePlaceholder: FeedbackPlaceholder = {
    kind: "inline",
    token: "<INLINE_CODE_1>",
    original: "`parse()`",
  };
  const blockPlaceholder: FeedbackPlaceholder = {
    kind: "block",
    token: "<CODE_BLOCK_1>",
  };

  test("returns null for a null feedback decision", () => {
    assert.equal(parseFeedbackResponse(response(null), [inlinePlaceholder]), null);
  });

  test("normalizes model whitespace", () => {
    assert.equal(
      parseFeedbackResponse(response("  Please   check\nthis.  "), []),
      "Please check this.",
    );
  });

  test("restores inline code exactly", () => {
    assert.equal(
      parseFeedbackResponse(
        response("Please check <INLINE_CODE_1>."),
        [inlinePlaceholder],
      ),
      "Please check `parse()`.",
    );
  });

  test("removes fenced code placeholders", () => {
    assert.equal(
      parseFeedbackResponse(
        response("Please review this code: <CODE_BLOCK_1>"),
        [blockPlaceholder],
      ),
      "Please review this code:",
    );
  });

  test("rejects missing, duplicated, changed, and unknown placeholders", () => {
    assert.equal(parseFeedbackResponse(response("Please check it."), [inlinePlaceholder]), null);
    assert.equal(
      parseFeedbackResponse(
        response("<INLINE_CODE_1> and <INLINE_CODE_1>"),
        [inlinePlaceholder],
      ),
      null,
    );
    assert.equal(
      parseFeedbackResponse(response("Please check <INLINE_CODE_2>."), [inlinePlaceholder]),
      null,
    );
    assert.equal(
      parseFeedbackResponse(
        response("Please check <INLINE-CODE-1>."),
        [inlinePlaceholder],
      ),
      null,
    );
  });

  test("rejects malformed or expanded response envelopes", () => {
    assert.equal(parseFeedbackResponse("not json", []), null);
    assert.equal(parseFeedbackResponse("```json\n{\"feedback\":null}\n```", []), null);
    assert.equal(parseFeedbackResponse('{"feedback":"Fine.","reason":"extra"}', []), null);
    assert.equal(parseFeedbackResponse('{"feedback":42}', []), null);
  });

  test("rejects model and restored output over their limits", () => {
    assert.equal(parseFeedbackResponse(response("a".repeat(1_001)), []), null);

    const longInline: FeedbackPlaceholder = {
      kind: "inline",
      token: "<INLINE_CODE_1>",
      original: `\`${"x".repeat(2_001)}\``,
    };
    assert.equal(
      parseFeedbackResponse(response("Use <INLINE_CODE_1>."), [longInline]),
      null,
    );
  });

  test("rejects control characters restored from inline code", () => {
    const unsafeInline: FeedbackPlaceholder = {
      kind: "inline",
      token: "<INLINE_CODE_1>",
      original: "`safe\u001b[31m`",
    };

    assert.equal(
      parseFeedbackResponse(response("Use <INLINE_CODE_1>."), [unsafeInline]),
      null,
    );
  });
});
