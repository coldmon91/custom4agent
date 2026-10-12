import assert from "node:assert/strict";
import { test } from "node:test";
import { appendListItem, ensureKey, getList, getScalar, setScalar } from "../src/frontmatter.ts";
import { sanitizeTitle } from "../src/names.ts";
import { appendCause, appendLog, insertRedmineRecord, replaceProgress } from "../src/note-body.ts";
import { formatText, parseText } from "../src/text-file.ts";
import { commitWebUrl, parseRemote } from "../src/git.ts";

const NOTE = `---
status: todo
started:
end-date:
task-id: "2026-000001"
redmine:
tags:
  - task
subtask:
git-commit:
---
# t

## 작업 로그
-
### 원인 분석

### 진행 상태
-
### Redmine

## 결과
- `;

test("frontmatter edits keep other lines and key order", () => {
  const lines = parseText(NOTE).lines;
  setScalar(lines, "status", "in_progress");
  appendListItem(lines, "subtask", '"[[a]]"');
  appendListItem(lines, "subtask", '"[[b]]"');
  ensureKey(lines, "priority");
  ensureKey(lines, "agent-session");
  assert.equal(getScalar(lines, "status"), "in_progress");
  assert.equal(getScalar(lines, "task-id"), "2026-000001");
  assert.deepEqual(getList(lines, "subtask"), ["[[a]]", "[[b]]"]);
  assert.deepEqual(getList(lines, "tags"), ["task"]);
  const keys = lines.slice(1, lines.indexOf("---", 1)).filter((line) => /^\S/.test(line)).map((line) => line.split(":")[0]);
  assert.deepEqual(keys, ["status", "started", "end-date", "task-id", "redmine", "tags", "subtask", "git-commit", "priority", "agent-session"]);
});

test("log entries go before fixed subsections, in date order, replacing the placeholder", () => {
  const lines = parseText(NOTE).lines;
  appendLog(lines, "2026-10-08", ["b1"]);
  appendLog(lines, "2026-10-06", ["a1"]);
  appendLog(lines, "2026-10-08", ["b2"]);
  appendCause(lines, ["cause"]);
  const text = lines.join("\n");
  assert.match(text, /## 작업 로그\n### 2026-10-06\n- a1\n### 2026-10-08\n- b1\n- b2\n### 원인 분석\n- cause\n\n### 진행 상태/);
});

test("progress snapshot replaces the whole section", () => {
  const lines = parseText(NOTE).lines;
  replaceProgress(lines, { current: "c1", remaining: "없음", blocked: "없음", date: "2026-10-01" });
  replaceProgress(lines, { current: "c2", remaining: "r", blocked: "b", date: "2026-10-02" });
  assert.match(lines.join("\n"), /### 진행 상태\n- 현재: c2\n- 남은 일: r\n- 막힘: b\n- 갱신: 2026-10-02\n### Redmine/);
});

test("redmine records stay in time order", () => {
  const lines = parseText(NOTE).lines;
  insertRedmineRecord(lines, "- [2026-10-07 15:44 김찬슬] #1 상태 진행→해결");
  insertRedmineRecord(lines, "- [2026-10-02 16:45] #1 현재 상태: 진행 (기준선)");
  assert.match(lines.join("\n"), /### Redmine\n- \[2026-10-02 16:45\][^\n]*\n- \[2026-10-07 15:44 김찬슬\][^\n]*\n\n## 결과/);
});

test("CRLF and BOM survive a round trip", () => {
  const raw = "\uFEFF---\r\nstatus: todo\r\n---\r\n# t\r\n";
  const doc = parseText(raw);
  setScalar(doc.lines, "status", "done");
  assert.equal(formatText(doc), "\uFEFF---\r\nstatus: done\r\n---\r\n# t\r\n");
});

test("titles drop characters that Obsidian or Windows reject", () => {
  assert.equal(sanitizeTitle("rsmuxer: [버그] a/b?  "), "rsmuxer - 버그 a b");
  assert.equal(sanitizeTitle("session3：openssl::3.5.6:"), "session3 - openssl - 3.5.6");
  assert.equal(sanitizeTitle("세션".normalize("NFD")), "세션");
  assert.throws(() => sanitizeTitle("CON"), /reserved/);
  assert.throws(() => sanitizeTitle(" :: "), /empty/);
});

test("remote URLs map to commit pages", () => {
  assert.deepEqual(parseRemote("git@gitlab.rsupport.com:server/rsmuxer.git"), { host: "gitlab.rsupport.com", path: "server/rsmuxer" });
  assert.equal(commitWebUrl("https://user@gitlab.rsupport.com/server/rsmuxer.git", "a1b2c3d"), "https://gitlab.rsupport.com/server/rsmuxer/-/commit/a1b2c3d");
  assert.equal(commitWebUrl("ssh://git@github.com/o/r.git", "a1b2c3d"), "https://github.com/o/r/commit/a1b2c3d");
  assert.equal(commitWebUrl("https://bitbucket.org/o/r.git", "a1b2c3d"), null);
});
