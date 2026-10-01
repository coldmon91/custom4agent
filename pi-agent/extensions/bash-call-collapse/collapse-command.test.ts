import assert from "node:assert/strict";
import { test } from "node:test";

import { collapseCommand } from "./collapse-command.ts";

test("single-line command hides nothing", () => {
	assert.deepEqual(collapseCommand("ls -la"), { firstLine: "ls -la", hiddenLineCount: 0 });
});

test("heredoc script keeps only the first line", () => {
	const command = "set -e\npython3 - <<'PY'\nfrom pathlib import Path\nPY";
	assert.deepEqual(collapseCommand(command), { firstLine: "set -e", hiddenLineCount: 3 });
});

test("blank lines at either end are not counted", () => {
	assert.deepEqual(collapseCommand("\n\nset -e\necho ok\n\n"), { firstLine: "set -e", hiddenLineCount: 1 });
});

test("CRLF line endings are split like LF", () => {
	assert.deepEqual(collapseCommand("set -e\r\necho ok"), { firstLine: "set -e", hiddenLineCount: 1 });
});

test("empty command stays empty", () => {
	assert.deepEqual(collapseCommand(""), { firstLine: "", hiddenLineCount: 0 });
});
