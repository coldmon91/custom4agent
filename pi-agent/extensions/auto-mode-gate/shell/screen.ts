/**
 * Decides whether a shell command can skip the classifier.
 *
 * The rule it enforces is the one the tool fast path already applies to `edit`
 * and `write`: read-only work is free, and a write is free while it lands
 * inside a trusted root. Anything it cannot read, or cannot place, goes to the
 * classifier — this screener never refuses a command, it only declines to
 * vouch for one.
 */

import { isInsideAnyRoot } from "../paths.ts";
import {
  COMMAND_PREFIXES,
  HEADER_WORDS,
  IN_ROOT_WRITE_COMMANDS,
  READ_ONLY_COMMANDS,
  READ_ONLY_GIT_REMOTE_ARGUMENTS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_NPM_SUBCOMMANDS,
  REJECTED_ARGUMENTS,
  REJECTED_CURL_FLAGS,
  SHELL_BUILTINS,
  STRUCTURAL_WORDS,
  hijacksLookup,
  looksSensitive,
} from "./command-policy.ts";
import { type ShellToken, readCommand } from "./tokenize.ts";

export interface ScreenContext {
  cwd: string;
  /** Directories a write may land in without being classified. */
  roots: readonly string[];
}

/**
 * What one segment of a command line does. `chdir` is tracked separately
 * because it moves the base that later relative paths resolve against, which
 * this screener resolves against the session's directory instead.
 */
type SegmentVerdict = "read-only" | "write" | "chdir" | "reject";

/** Discards output instead of writing a file, so it needs no containment check. */
const NULL_SINKS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function isOption(text: string): boolean {
  return text.startsWith("-") && text !== "-";
}

/** Non-option arguments, in the order they appear. */
function operands(tokens: readonly ShellToken[]): ShellToken[] {
  return tokens.filter((token) => !token.operator && !isOption(token.text));
}

function landsInsideRoots(token: ShellToken, context: ScreenContext): boolean {
  // An unexpanded `$VAR` has no value here, so its destination is unknowable.
  if (token.expanded) return false;
  return isInsideAnyRoot(token.text, context.roots, context.cwd);
}

interface RedirectionCheck {
  contained: boolean;
  /** `true` when output goes to a real file rather than a null sink. */
  writesFile: boolean;
}

/** Every output redirection either discards output or lands inside a trusted root. */
function checkRedirections(
  tokens: readonly ShellToken[],
  context: ScreenContext,
): RedirectionCheck {
  let writesFile = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as ShellToken;
    if (!token.operator) continue;

    // Heredocs feed data in; `2>&1` only duplicates an existing descriptor.
    if (token.text.startsWith("<<") || token.text.includes("&")) continue;
    if (token.text.endsWith("<")) continue;

    const target = tokens[index + 1];
    if (!target || target.operator) return { contained: false, writesFile };
    if (NULL_SINKS.has(target.text)) continue;
    if (!landsInsideRoots(target, context)) return { contained: false, writesFile };

    writesFile = true;
  }

  return { contained: true, writesFile };
}

function hasRejectedArgument(command: string, tokens: readonly ShellToken[]): boolean {
  const patterns = REJECTED_ARGUMENTS.get(command);
  if (!patterns) return false;

  return tokens.some((token) => patterns.some((pattern) => pattern.test(token.text)));
}

function isInPlaceSed(tokens: readonly ShellToken[]): boolean {
  return tokens.some((token) => /^(-i|--in-place)/.test(token.text));
}

/** `git` is read-only only for the subcommands that cannot change the repository. */
function isReadOnlyGit(tokens: readonly ShellToken[]): boolean {
  const subcommand = tokens[1];
  // A global option before the subcommand (`git -c ...`) can change what runs.
  if (!subcommand || subcommand.operator || isOption(subcommand.text)) return false;
  if (subcommand.text === "remote") {
    return READ_ONLY_GIT_REMOTE_ARGUMENTS.has(tokens[2]?.text);
  }
  // Staging only moves files into the index of the repository already in scope.
  if (subcommand.text === "add") return true;
  return READ_ONLY_GIT_SUBCOMMANDS.has(subcommand.text);
}

function isReadOnlyNpm(tokens: readonly ShellToken[]): boolean {
  const subcommand = tokens[1];
  if (!subcommand || subcommand.operator) return false;
  return READ_ONLY_NPM_SUBCOMMANDS.has(subcommand.text);
}

/** `curl` without the flags that upload, authenticate, or write a file. */
function isPlainCurlRead(tokens: readonly ShellToken[]): boolean {
  return !tokens.some((token) =>
    REJECTED_CURL_FLAGS.some((pattern) => pattern.test(token.text)),
  );
}

/** Looks like a `timeout` duration: `10`, `1.5`, `2m`. */
const DURATION = /^[0-9]+(\.[0-9]+)?[smhd]?$/;

/**
 * Removes the words that run no command of their own: structural shell syntax,
 * leading assignments, and wrappers such as `gtimeout 10` or `env -i`. What is
 * left is the command that actually runs, which is what gets judged.
 */
function toRunningCommand(tokens: readonly ShellToken[]): ShellToken[] | "header" {
  const words = [...tokens];

  while (words[0]) {
    const text = words[0].text;

    if (HEADER_WORDS.has(text)) return "header";

    if (ASSIGNMENT.test(text) || STRUCTURAL_WORDS.has(text)) {
      words.shift();
      continue;
    }

    if (COMMAND_PREFIXES.has(text)) {
      words.shift();
      // Drop the wrapper's own options, assignments, and duration argument.
      while (words[0] && !words[0].operator) {
        const next = words[0].text;
        if (isOption(next) || ASSIGNMENT.test(next) || DURATION.test(next)) {
          words.shift();
          continue;
        }
        break;
      }
      continue;
    }

    break;
  }

  return words;
}

function screenSegment(tokens: readonly ShellToken[], context: ScreenContext): SegmentVerdict {
  if (tokens.some((token) => looksSensitive(token.text) || hijacksLookup(token.text))) {
    return "reject";
  }

  const stripped = toRunningCommand(tokens);
  // A `for`/`case` header runs nothing; the body is screened as its own segment.
  if (stripped === "header") return "read-only";

  const words = stripped;
  // A segment of assignments or shell syntax alone changes nothing on disk.
  if (words.length === 0) return "read-only";

  const head = words[0] as ShellToken;
  if (head.operator || head.expanded) return "reject";

  const command = head.text.split("/").pop() ?? head.text;

  if (hasRejectedArgument(command, words)) return "reject";

  const redirections = checkRedirections(words, context);
  if (!redirections.contained) return "reject";

  const effect: SegmentVerdict = redirections.writesFile ? "write" : "read-only";

  // `cd` anywhere is harmless on its own; what it would rebase is handled by
  // refusing to approve a chdir and a write in the same command line.
  if (command === "cd") return "chdir";

  if (SHELL_BUILTINS.has(command)) return effect;

  // `command -v foo` asks where a binary is; `command foo` runs it.
  if (command === "command") {
    const flag = words[1]?.text;
    return flag === "-v" || flag === "-V" ? effect : "reject";
  }

  if (command === "git") return isReadOnlyGit(words) ? effect : "reject";

  if (command === "npm") return isReadOnlyNpm(words) ? effect : "reject";

  if (command === "curl") return isPlainCurlRead(words) ? effect : "reject";

  if (command === "sed" && !isInPlaceSed(words)) return effect;

  if (READ_ONLY_COMMANDS.has(command)) return effect;

  if (IN_ROOT_WRITE_COMMANDS.has(command)) {
    // `sed -i script file`, `cp a b`, `mkdir dir`: every target has to be placeable.
    const targets = operands(words).slice(1);
    return targets.length > 0 && targets.every((token) => landsInsideRoots(token, context))
      ? "write"
      : "reject";
  }

  return "reject";
}

/**
 * `true` when every segment of the command line is safe by construction.
 */
export function isAutoApprovedShellCommand(command: string, context: ScreenContext): boolean {
  const reading = readCommand(command);
  if (!reading.readable) return false;

  const verdicts = reading.segments.map((segment) => screenSegment(segment, context));

  if (verdicts.includes("reject")) return false;

  // With the working directory moved, a later relative write would be checked
  // against the wrong base, so the two are never approved in one command line.
  return !(verdicts.includes("chdir") && verdicts.includes("write"));
}
