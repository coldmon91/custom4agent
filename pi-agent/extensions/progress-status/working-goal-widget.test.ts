import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { workingGoalWidget } from "./working-goal-widget.ts";

for (const width of [0, 1, 2, 3, 20, 30, 40, 80, 120]) {
  test(`the purpose widget stays on one line within ${width} columns`, () => {
    const widget = workingGoalWidget("Working on: Diagnosing missing progress updates");
    const lines = widget.render(width);
    assert.equal(lines.length, 1);
    assert.ok(visibleWidth(lines[0]) <= width);
    assert.doesNotMatch(lines[0], /[\r\n]/);
    if (width >= 80) assert.equal(lines[0], "Working on: Diagnosing missing progress updates");
  });
}

test("resize and invalidation do not retain a previous truncated layout", () => {
  const text = "Working on: Verifying regression tests";
  const widget = workingGoalWidget(text);
  assert.notEqual(widget.render(20)[0], text);
  widget.invalidate();
  assert.equal(widget.render(80)[0], text);
  assert.ok(visibleWidth(widget.render(10)[0]) <= 10);
});
