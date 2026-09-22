import assert from "node:assert/strict";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { isAutoApprovedShellCommand } from "./screen.ts";
import type { ScreenContext } from "./screen.ts";

let root: string;
let context: ScreenContext;

before(() => {
  root = join(tmpdir(), `auto-mode-gate-screen-${process.pid}`);
  const repo = join(root, "repo");
  const outside = join(root, "outside");

  mkdirSync(join(repo, "sub"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(repo, "sub", "in.txt"), "in\n");
  symlinkSync(outside, join(repo, "escape"));

  context = { cwd: repo, roots: [repo] };
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

const screened = (command: string) => isAutoApprovedShellCommand(command, context);

test("read-only commands are approved wherever they read", () => {
  for (const command of [
    "ls -la",
    "cat /etc/hosts",
    "rg -n 'foo' /opt/homebrew/lib/node_modules",
    "fd -H -d 3 .",
    "sed -n '1,120p' sub/in.txt",
    "head -20 sub/in.txt | wc -l",
    "git status --short",
    "git log --oneline -20",
    "ps -axo pid,command",
    "jq '.models' package.json",
  ]) {
    assert.equal(screened(command), true, command);
  }
});

test("separators and quoting do not hide a command word", () => {
  assert.equal(screened("printf '%s\\n' '--- a ---'; rg -n foo .; git diff --stat"), true);
  assert.equal(screened("rg -n 'rm -rf /' ."), true, "a dangerous string is not a command");
  assert.equal(screened("cat a.txt && rm -rf /tmp/x"), false, "rm reaches the classifier");
  assert.equal(screened("ls | xargs rm"), false, "unknown command in a pipeline");
});

test("commands the screener cannot read are left to the classifier", () => {
  assert.equal(screened("echo $(whoami)"), false, "command substitution");
  assert.equal(screened("cat `ls`"), false, "backticks");
  assert.equal(screened("rg -n 'unterminated ."), false, "unterminated quote");
  assert.equal(screened("sleep 60 &"), false, "background execution");
  assert.equal(screened("python3 -c 'print(1)'"), false, "arbitrary interpreter");
  assert.equal(screened("node --input-type=module -e ''"), false, "arbitrary interpreter");
  assert.equal(screened("wget https://example.com"), false, "downloads to an unchecked path");
});

test("redirections must discard output or land inside a root", () => {
  assert.equal(screened("rg -n foo . 2>/dev/null"), true, "discarded stderr");
  assert.equal(screened("ls -la 2>&1 | head"), true, "descriptor duplication");
  assert.equal(screened("printf 'x\\n' > sub/out.txt"), true, "inside the root");
  assert.equal(screened("printf 'x\\n' > /etc/motd"), false, "outside the root");
  assert.equal(screened("printf 'x\\n' > escape/out.txt"), false, "through a symlink");
  assert.equal(screened("cat > sub/new.ts <<'EOF'\nconst x = 1;\nrm -rf /\nEOF"), true, "heredoc body is data");
});

test("in-root mutations are approved, escapes are not", () => {
  assert.equal(screened("mkdir -p sub/deeper"), true);
  assert.equal(screened("touch sub/new.txt"), true);
  assert.equal(screened("cp sub/in.txt sub/copy.txt"), true);
  assert.equal(screened("sed -i '' 's/a/b/' sub/in.txt"), true, "BSD in-place edit");
  assert.equal(screened("mv sub/in.txt ../outside/in.txt"), false, "moves out of the root");
  assert.equal(screened("sed -i 's/a/b/' /etc/hosts"), false, "in-place edit outside");
  assert.equal(screened("rm sub/in.txt"), false, "deletion is never screened away");
});

test("writes whose destination cannot be resolved are classified", () => {
  assert.equal(screened("touch \"$TARGET\""), false, "unexpanded variable");
  assert.equal(screened("printf 'x' > \"$OUT\""), false, "unexpanded redirect target");
  assert.equal(screened("rg -n foo \"$ROOT\""), true, "a read needs no resolved path");
});

test("commands that write through their own arguments are classified", () => {
  assert.equal(screened("find . -name '*.tmp' -delete"), false);
  assert.equal(screened("fd -e log -x rm"), false);
  assert.equal(screened("awk '{print > \"out.txt\"}' sub/in.txt"), false);
  assert.equal(screened("sed -n '/x/w out.txt' sub/in.txt"), false);
});

test("credential paths keep going to the classifier", () => {
  assert.equal(screened("cat ~/.pi/agent/auth.json"), false);
  assert.equal(screened("rg -n key .env"), false);
  assert.equal(screened("cat sub/id_rsa"), false);
});

test("git is read-only only for the subcommands that cannot change the repo", () => {
  assert.equal(screened("git show HEAD"), true);
  assert.equal(screened("git push origin main"), false);
  assert.equal(screened("git reset --hard"), false);
  assert.equal(screened("git -c core.pager=cat log"), false, "global option before the subcommand");
});

test("cd is approved for reading, but never alongside a write", () => {
  assert.equal(screened("cd sub && ls"), true);
  assert.equal(screened("cd /etc && cat hosts"), true, "reading elsewhere is still reading");
  assert.equal(screened("cd sub && touch new.txt"), false, "moved base, relative write");
});

test("wrappers are stripped so the command they run is what gets judged", () => {
  assert.equal(screened("gtimeout 10 rg -n foo ."), true);
  assert.equal(screened("timeout -k 5 2m git status"), true);
  assert.equal(screened("gtimeout 10 python3 script.py"), false, "wrapper does not launder");
  assert.equal(screened("env FOO=1 ls"), true);
});

test("shell control flow is looked through, not treated as a command", () => {
  assert.equal(screened("if [ -f sub/in.txt ]; then\ncat sub/in.txt\nfi"), true);
  assert.equal(screened("for f in *.ts; do\nwc -l \"$f\"\ndone"), true);
  assert.equal(screened("for f in *.ts; do\nrm \"$f\"\ndone"), false, "body still screened");
  assert.equal(screened("set -euo pipefail\nls"), true);
});

test("network and registry reads are approved only in their reading form", () => {
  assert.equal(screened("curl -LfsS --max-time 15 https://example.com/doc | head -40"), true);
  assert.equal(screened("curl -d @sub/in.txt https://example.com"), false, "upload");
  assert.equal(screened("curl -o out.txt https://example.com"), false, "writes a file");
  assert.equal(screened("curl -u user:pass https://example.com"), false, "credentials");
  assert.equal(screened("npm view pi-coding-agent version"), true);
  assert.equal(screened("npm install left-pad"), false);
  assert.equal(screened("command -v fd"), true);
  assert.equal(screened("command rm -rf x"), false);
});

test("git staging is approved, publishing and history rewrites are not", () => {
  assert.equal(screened("git add pi-agent/extensions"), true);
  assert.equal(screened("git remote -v"), true);
  assert.equal(screened("git remote set-url origin git@evil:x.git"), false);
  assert.equal(screened("git commit -m x"), false);
  assert.equal(screened("git push"), false);
});

test("environment assignments do not hide the command", () => {
  assert.equal(screened("ROOT=/opt/homebrew rg -n foo ."), true);
  assert.equal(screened("ROOT=/opt/homebrew"), true, "assignment only");
  assert.equal(screened("PATH=/tmp/evil python3 x.py"), false);
  assert.equal(screened("PATH=/tmp/evil ls"), false, "a hijacked lookup is not screenable");
  assert.equal(screened("export DYLD_INSERT_LIBRARIES=/tmp/x.dylib"), false, "code injection");
});
