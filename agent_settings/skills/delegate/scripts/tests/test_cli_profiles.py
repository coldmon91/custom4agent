import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cli_profiles import PROFILES, Mode, StdoutTarget  # noqa: E402

OUTPUT = Path("/run/output.txt")

# Any of these in a review argv would grant write access.
WRITE_GRANTS = {
    "codex": {"workspace-write", "danger-full-access", "--dangerously-bypass-approvals-and-sandbox"},
    "pi": {"edit", "write"},
    "claude": {"Edit", "Write", "Bash", "acceptEdits", "bypassPermissions",
               "--dangerously-skip-permissions"},
}


def argv_tokens(argv: list[str]) -> set[str]:
    """Every argv entry plus each element of comma or space separated lists."""
    tokens = set(argv)
    for entry in argv:
        tokens.update(entry.replace(",", " ").split())
    return tokens


class ExpectedArgvTest(unittest.TestCase):
    def build(self, cli: str, mode: Mode):
        return PROFILES[cli].build(mode, "m", "e", OUTPUT)

    def test_codex(self):
        agent = self.build("codex", Mode.AGENT)
        self.assertEqual(agent.argv, [
            "codex", "-a", "never", "e", "--skip-git-repo-check", "-s", "workspace-write",
            "-m", "m", "-c", "model_reasoning_effort=e", "-o", str(OUTPUT), "-",
        ])
        self.assertEqual(agent.stdout_target, StdoutTarget.LOG)
        self.assertIn("read-only", self.build("codex", Mode.REVIEW).argv)

    def test_pi(self):
        self.assertEqual(self.build("pi", Mode.AGENT).argv, [
            "pi", "-p", "--no-session", "--no-approve", "--tool-mode", "write",
            "--tools", "read,grep,find,ls,edit,write,bash", "--model", "m", "--thinking", "e",
        ])
        self.assertEqual(self.build("pi", Mode.REVIEW).argv, [
            "pi", "-p", "--no-session", "--no-approve", "--tool-mode", "auto",
            "--tools", "read,grep,find,ls,bash", "--model", "m", "--thinking", "e",
        ])

    def test_claude(self):
        self.assertEqual(self.build("claude", Mode.AGENT).argv, [
            "claude", "-p", "--permission-mode", "acceptEdits", "--no-session-persistence",
            "--strict-mcp-config", "--tools", "Read,Grep,Glob,Edit,Write,Bash",
            "--allowedTools", "Read Grep Glob Edit Write Bash", "--model", "m", "--effort", "e",
        ])
        self.assertEqual(self.build("claude", Mode.REVIEW).argv, [
            "claude", "-p", "--restricted", "--no-session-persistence", "--strict-mcp-config",
            "--tools", "Read,Grep,Glob", "--allowedTools", "Read Grep Glob",
            "--model", "m", "--effort", "e",
        ])


class ReviewIsReadOnlyTest(unittest.TestCase):
    def test_no_write_grant_in_any_review_argv(self):
        self.assertEqual(set(PROFILES), set(WRITE_GRANTS))
        for cli, profile in PROFILES.items():
            with self.subTest(cli=cli):
                tokens = argv_tokens(profile.build(Mode.REVIEW, "m", "e", OUTPUT).argv)
                self.assertFalse(tokens & WRITE_GRANTS[cli], tokens & WRITE_GRANTS[cli])


if __name__ == "__main__":
    unittest.main()
