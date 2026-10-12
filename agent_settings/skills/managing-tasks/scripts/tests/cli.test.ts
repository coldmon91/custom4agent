import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { cli, cliAsync, createSandbox, read, type Sandbox } from "./helpers.ts";

const DATE = "2026-10-12";
const SESSION = { CLAUDE_CODE_SESSION_ID: "11111111-2222-3333-4444-555555555555" };

function initSandbox(): Sandbox {
  const sandbox = createSandbox();
  const result = cli(sandbox, ["init", "--vault", sandbox.vault, "--date", DATE]);
  assert.equal(result.json.ok, true, JSON.stringify(result.json));
  return sandbox;
}

describe("init", () => {
  let sandbox: Sandbox;
  before(() => (sandbox = initSandbox()));
  after(() => sandbox.cleanup());

  test("creates folders, template copies, base and the sample task", () => {
    for (const status of ["todo", "in_progress", "done"]) assert.ok(existsSync(join(sandbox.tasksDir, "2026", status)));
    assert.ok(existsSync(join(sandbox.vault, "Templates", "task.md")));
    assert.ok(existsSync(join(sandbox.tasksDir, "Tasks.base")));
    const sample = read(join(sandbox.tasksDir, "2026", "todo", "sample - 첫 Task", "sample - 첫 Task.md"));
    assert.match(sample, /task-id: "1900-000001"/);
  });

  test("second run skips everything", () => {
    const result = cli(sandbox, ["init", "--date", DATE]);
    assert.ok(result.json.steps.every((step: { outcome: string }) => step.outcome === "skipped"));
  });

  test("refuses to switch to another vault", () => {
    const result = cli(sandbox, ["init", "--vault", join(sandbox.root, "other"), "--date", DATE]);
    assert.equal(result.json.error?.code, "conflict");
  });
});

describe("task lifecycle", () => {
  let sandbox: Sandbox;
  let notePath: string;
  before(() => (sandbox = initSandbox()));
  after(() => sandbox.cleanup());

  test("create fills the template and records the session", () => {
    const result = cli(sandbox, ["create", "--title", "rsmuxer: 메모리 누수", "--redmine", "48213", "--priority", "high", "--date", DATE], SESSION);
    assert.equal(result.json.ok, true, JSON.stringify(result.json));
    assert.equal(result.json.task.name, "rsmuxer - 메모리 누수");
    assert.equal(result.json.task.taskId, "2026-000001");
    notePath = result.json.task.path;
    const note = read(notePath);
    assert.match(note, /redmine: 48213\n/);
    assert.match(note, /priority: high\n/);
    assert.match(note, /agent-session:\n {2}- claude --resume 11111111/);
    assert.match(note, /## 배경\n- \[Redmine #48213\]\(https:\/\/projects\.rsupport\.com\/issues\/48213\)\n## 목표/);
    assert.match(note, /^# rsmuxer - 메모리 누수$/m);
  });

  test("duplicate names are refused", () => {
    const result = cli(sandbox, ["create", "--title", "rsmuxer - 메모리 누수", "--date", DATE]);
    assert.equal(result.json.error?.code, "conflict");
  });

  test("ambiguous queries return candidates", () => {
    cli(sandbox, ["create", "--title", "rsmuxer 로그 정리", "--date", DATE]);
    const result = cli(sandbox, ["find", "rsmuxer"]);
    assert.equal(result.json.error?.code, "ambiguous");
    assert.equal((result.json.error?.candidates as unknown[]).length, 2);
    assert.equal(cli(sandbox, ["find", "2026-000002"]).json.task.name, "rsmuxer 로그 정리");
  });

  test("start moves the folder and sets started", () => {
    const result = cli(sandbox, ["move", "메모리", "in_progress", "--date", DATE], SESSION);
    assert.equal(result.json.ok, true, JSON.stringify(result.json));
    notePath = result.json.task.path;
    assert.match(notePath, /in_progress/);
    const note = read(notePath);
    assert.match(note, /status: in_progress\nstarted: 2026-10-12\n/);
    assert.equal(note.match(/claude --resume/g)?.length, 1, "same session recorded once");
  });

  test("log, cause, progress and subtasks", () => {
    assert.equal(cli(sandbox, ["log", "메모리", "--item", "valgrind 로 재현함", "--cause", "소멸자 해제 누락", "--date", DATE]).json.ok, true);
    assert.equal(cli(sandbox, ["subtask", "add", "메모리", "소멸자 수정", "--date", DATE]).json.ok, true);
    assert.equal(cli(sandbox, ["progress", "메모리", "--current", "원인 확인", "--remaining", "[[소멸자 수정]]", "--date", DATE]).json.ok, true);
    const note = read(notePath);
    assert.match(note, /subtask:\n {2}- "\[\[소멸자 수정\]\]"/);
    assert.match(note, /### 2026-10-12\n- valgrind 로 재현함\n/);
    assert.match(note, /### 원인 분석\n- 소멸자 해제 누락\n/);
    assert.match(note, /- 남은 일: \[\[소멸자 수정\]\]/);
    assert.match(read(join(notePath, "..", "소멸자 수정.md")), /parent: rsmuxer - 메모리 누수\n/);
  });

  test("completion asks once for pending items and a result", () => {
    const result = cli(sandbox, ["move", "메모리", "done", "--date", DATE]);
    assert.equal(result.json.error?.code, "needs_confirmation");
    assert.equal(result.json.error?.resultRequired, true);
    assert.deepEqual(result.json.error?.pending, ["subtask: 소멸자 수정 (todo)"]);
    assert.equal(result.json.error?.path, notePath);
    assert.ok(read(notePath).includes("status: in_progress"), "nothing changed");
  });

  test("subtask done then completion", () => {
    assert.equal(cli(sandbox, ["subtask", "done", "메모리", "소멸자 수정", "--date", DATE]).json.ok, true);
    const result = cli(sandbox, ["move", "메모리", "done", "--result", "누수 수정 배포", "--date", "2026-10-13"]);
    assert.equal(result.json.ok, true, JSON.stringify(result.json));
    notePath = result.json.task.path;
    const note = read(notePath);
    assert.match(note, /status: done\nstarted: 2026-10-12\nend-date: 2026-10-13\n/);
    assert.match(note, /- \[\[소멸자 수정\]\] 완료/);
    assert.match(note, /## 결과\n- 누수 수정 배포/);
  });

  test("moving back clears the later dates", () => {
    const result = cli(sandbox, ["move", "메모리", "in_progress", "--date", DATE]);
    assert.match(read(result.json.task.path), /status: in_progress\nstarted: 2026-10-12\nend-date:\n/);
  });

  test("rename updates file, heading, subtask parent and links", () => {
    const other = join(sandbox.vault, "notes.md");
    writeFileSync(other, "see [[rsmuxer - 메모리 누수]] and [[rsmuxer - 메모리 누수#배경|bg]]\n");
    const result = cli(sandbox, ["rename", "메모리", "--to", "rsmuxer - ConvertJob 누수", "--date", DATE]);
    assert.equal(result.json.ok, true, JSON.stringify(result.json));
    const path = result.json.task.path;
    assert.match(path, /rsmuxer - ConvertJob 누수[\\/]rsmuxer - ConvertJob 누수\.md$/);
    assert.match(read(path), /^# rsmuxer - ConvertJob 누수$/m);
    assert.match(read(join(path, "..", "소멸자 수정.md")), /parent: rsmuxer - ConvertJob 누수\n/);
    assert.equal(read(other), "see [[rsmuxer - ConvertJob 누수]] and [[rsmuxer - ConvertJob 누수#배경|bg]]\n");
  });

  test("redmine add, record and list", () => {
    assert.equal(cli(sandbox, ["redmine", "add", "ConvertJob", "#50001", "--date", DATE]).json.placement, "related");
    assert.equal(cli(sandbox, ["redmine", "add", "ConvertJob", "48213", "--date", DATE]).json.placement, "already-present");
    const record = cli(sandbox, ["redmine", "record", "ConvertJob", "--line", "[2026-10-07 15:44 김찬슬] #48213 상태 진행→해결", "--date", DATE]);
    assert.equal(record.json.ok, true, JSON.stringify(record.json));
    const issues = cli(sandbox, ["redmine", "list", "ConvertJob"]).json.issues;
    assert.deepEqual(issues, [
      { issue: 48213, source: "redmine", lastRecorded: "2026-10-07 15:44" },
      { issue: 50001, source: "related", lastRecorded: null },
    ]);
    assert.equal(cli(sandbox, ["redmine", "record", "ConvertJob", "--line", "bad line"]).json.error?.code, "invalid_value");
  });
});

describe("commits", () => {
  let sandbox: Sandbox;
  let repo: string;
  before(() => {
    sandbox = initSandbox();
    repo = join(sandbox.root, "repo");
    mkdirSync(repo);
    const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 15_000 }).trim();
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("remote", "add", "origin", "git@gitlab.rsupport.com:server/rsmuxer.git");
    git("commit", "-q", "--allow-empty", "-m", "fix leak #48213");
    git("commit", "-q", "--allow-empty", "-m", "unrelated #482130");
    cli(sandbox, ["create", "--title", "rsmuxer 커밋", "--redmine", "48213", "--date", DATE]);
  });
  after(() => sandbox.cleanup());

  test("search finds only commits for the exact issue, add records URLs once", () => {
    const search = cli(sandbox, ["commit", "search", "커밋", "--repo", repo]);
    assert.equal(search.json.candidates.length, 1);
    const sha = search.json.candidates[0].sha;
    const add = cli(sandbox, ["commit", "add", "커밋", sha, "--repo", repo, "--date", DATE]);
    assert.deepEqual(add.json.added, [`https://gitlab.rsupport.com/server/rsmuxer/-/commit/${sha}`]);
    assert.deepEqual(cli(sandbox, ["commit", "add", "커밋", sha, "--repo", repo]).json.skipped.length, 1);
    assert.equal(cli(sandbox, ["commit", "search", "커밋", "--repo", repo]).json.candidates.length, 0);
  });
});

describe("normalization of existing notes", () => {
  let sandbox: Sandbox;
  before(() => (sandbox = initSandbox()));
  after(() => sandbox.cleanup());

  test("task.md is renamed and a missing task-id is assigned on write", () => {
    const folder = join(sandbox.tasksDir, "2026", "in_progress", "session 예전 노트");
    mkdirSync(folder);
    writeFileSync(join(folder, "task.md"), "---\r\nstatus: in_progress\r\nstarted: 2026-01-01\r\nend-date:\r\nredmine:\r\ntags:\r\n  - task\r\n---\r\n# session 예전 노트\r\n");
    const result = cli(sandbox, ["log", "예전", "--item", "hello", "--date", DATE]);
    assert.equal(result.json.ok, true, JSON.stringify(result.json));
    const note = read(join(folder, "session 예전 노트.md"));
    assert.ok(!existsSync(join(folder, "task.md")));
    assert.match(note, /end-date:\r\ntask-id: "2026-000001"\r\n/);
    assert.match(note, /## 작업 로그\r\n### 2026-10-12\r\n- hello/);
  });

  test("legacy single-file tasks move untouched and refuse edits", () => {
    const legacy = join(sandbox.tasksDir, "2026", "in_progress", "session3 openssl.md");
    writeFileSync(legacy, "+ 시작: 2026-01-01\n");
    assert.equal(cli(sandbox, ["log", "openssl", "--item", "x"]).json.error?.code, "legacy_task");
    const moved = cli(sandbox, ["move", "openssl", "done"]);
    assert.equal(moved.json.task.legacy, true);
    assert.equal(read(join(sandbox.tasksDir, "2026", "done", "session3 openssl.md")), "+ 시작: 2026-01-01\n");
  });
});

describe("concurrency", () => {
  let sandbox: Sandbox;
  before(() => (sandbox = initSandbox()));
  after(() => sandbox.cleanup());

  test("parallel creates get distinct task-ids", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => cliAsync(sandbox, ["create", "--title", `rsmuxer 병렬 ${i}`, "--date", DATE])),
    );
    const ids = results.map((result) => result.json.task?.taskId);
    assert.equal(new Set(ids).size, 6, JSON.stringify(ids));
  });
});

describe("session detection", () => {
  let sandbox: Sandbox;
  before(() => (sandbox = initSandbox()));
  after(() => sandbox.cleanup());

  test("inherited variables from several agents are not guessed", () => {
    const result = cli(sandbox, ["create", "--title", "pi 세션", "--date", DATE], { ...SESSION, PI_SESSION_ID: "pi-1" });
    assert.match(result.json.session.skipped, /several agent sessions/);
    const explicit = cli(sandbox, ["session", "pi 세션", "--agent", "pi"], { ...SESSION, PI_SESSION_ID: "pi-1" });
    assert.deepEqual(explicit.json.session, { recorded: "pi --session pi-1" });
  });
});
