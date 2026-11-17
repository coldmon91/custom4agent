"""Per-CLI launch argv for each delegation mode.

Every permission flag lives here and nowhere else, so a review run cannot be given
write access by a mistyped shell command.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable


class Mode(str, Enum):
    AGENT = "agent"    # may modify files in the workspace
    REVIEW = "review"  # analysis only


class ProgressSignal(Enum):
    STREAMING_LOG = "streaming_log"  # the log grows while the CLI works
    SILENT = "silent"                # nothing is written until the run ends


class StdoutTarget(str, Enum):
    OUTPUT = "output"  # stdout is the final reply
    LOG = "log"        # stdout is progress; the reply is written to the output file by flag


@dataclass(frozen=True)
class LaunchSpec:
    argv: list[str]
    stdout_target: StdoutTarget


@dataclass(frozen=True)
class CliProfile:
    name: str
    progress: ProgressSignal
    build: Callable[[Mode, str, str, Path], LaunchSpec]

    @property
    def executable(self) -> str:
        return self.name


def build_codex(mode: Mode, model: str, effort: str, output_path: Path) -> LaunchSpec:
    sandbox = "workspace-write" if mode is Mode.AGENT else "read-only"
    argv = [
        "codex", "-a", "never", "e", "--skip-git-repo-check", "-s", sandbox,
        "-m", model, "-c", f"model_reasoning_effort={effort}",
        "-o", str(output_path),
        # Trailing `-` makes stdin the whole prompt instead of an appended block.
        "-",
    ]
    return LaunchSpec(argv, StdoutTarget.LOG)


PI_AGENT_TOOLS = "read,grep,find,ls,edit,write,bash"
# No edit/write tools: every file-changing path stays in the shell, where the
# auto-mode gate can see it. bash is kept so pi can read git history.
PI_REVIEW_TOOLS = "read,grep,find,ls,bash"


def build_pi(mode: Mode, model: str, effort: str, output_path: Path) -> LaunchSpec:
    # `write` mode: a print-mode run has no UI to approve a screened call.
    tool_mode, tools = ("write", PI_AGENT_TOOLS) if mode is Mode.AGENT else ("auto", PI_REVIEW_TOOLS)
    argv = [
        "pi", "-p", "--no-session", "--no-approve",
        "--tool-mode", tool_mode, "--tools", tools,
        "--model", model, "--thinking", effort,
    ]
    return LaunchSpec(argv, StdoutTarget.OUTPUT)


CLAUDE_AGENT_TOOLS = ("Read", "Grep", "Glob", "Edit", "Write", "Bash")
CLAUDE_REVIEW_TOOLS = ("Read", "Grep", "Glob")


def build_claude(mode: Mode, model: str, effort: str, output_path: Path) -> LaunchSpec:
    argv = ["claude", "-p"]
    if mode is Mode.AGENT:
        tools = CLAUDE_AGENT_TOOLS
        argv += ["--permission-mode", "acceptEdits"]
    else:
        tools = CLAUDE_REVIEW_TOOLS
        # Removes command tools and confines file tools to the working directory.
        argv += ["--restricted"]
    argv += [
        "--no-session-persistence", "--strict-mcp-config",
        "--tools", ",".join(tools), "--allowedTools", " ".join(tools),
        "--model", model, "--effort", effort,
    ]
    return LaunchSpec(argv, StdoutTarget.OUTPUT)


PROFILES = {
    profile.name: profile
    for profile in (
        CliProfile("codex", ProgressSignal.STREAMING_LOG, build_codex),
        CliProfile("pi", ProgressSignal.SILENT, build_pi),
        CliProfile("claude", ProgressSignal.SILENT, build_claude),
    )
}
