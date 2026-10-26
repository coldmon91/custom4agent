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
import { getPermissionPolicy, type PermissionPolicy } from "../permission-policy.ts";
import { isPermissionPolicyPath } from "../permission-policy-protection.ts";
import { isProtectedWritePath } from "../protected-paths.ts";
import { HEADER_WORDS, REJECTED_ARGUMENTS, STRUCTURAL_WORDS, hijacksLookup, looksSensitive } from "./command-policy.ts";
import { PLACES_LINKS, isVersionOrHelpQuery, keepsReadShape, writeTargets } from "./command-shapes.ts";
import { type OutputPlacement, curlVerdict } from "./curl.ts";
import { splitExecCommands } from "./exec-arguments.ts";
import { gitVerdict } from "./git.ts";
import { NESTED_SHELLS, readNestedScript } from "./nested-shell.ts";
import { type ShellToken, commandArguments, readCommand } from "./tokenize.ts";
import { isWrapper, unwrap } from "./wrappers.ts";

export interface ScreenContext {
  cwd: string;
  /** Directories a write may land in without being classified. */
  roots: readonly string[];
  policy?: PermissionPolicy;
}

/**
 * What one segment of a command line does. `chdir` is tracked separately
 * because it moves the base that later relative paths resolve against, which
 * this screener resolves against the session's directory instead. `copy` is a
 * write that can place symlinks, which later writes could then pass through.
 */
type SegmentVerdict = "read-only" | "write" | "copy" | "stage" | "chdir" | "reject";

function writes(verdict: SegmentVerdict): boolean {
  return verdict === "write" || verdict === "copy";
}

/** Discards output instead of writing a file, so it needs no containment check. */
const NULL_SINKS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr"]);

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** How deep `bash -c`, `$(...)` and `find -exec` may nest before the screener gives up. */
const MAX_NESTING = 3;

/** Where binaries named by absolute path may live; anywhere else could hold a planted file. */
const SYSTEM_BIN_DIRECTORIES = ["/bin/", "/usr/bin/", "/usr/sbin/", "/sbin/", "/opt/homebrew/bin/", "/usr/local/bin/"];

/**
 * The command a word runs, or `undefined` when it could be a file the agent
 * wrote itself: `./cat` is not `cat`.
 */
function commandName(token: ShellToken): string | undefined {
  if (token.operator || token.expanded || token.text === "" || /\s/.test(token.text)) return undefined;
  if (!token.text.includes("/")) return token.text;

  const directory = SYSTEM_BIN_DIRECTORIES.find((prefix) => token.text.startsWith(prefix));
  const name = directory ? token.text.slice(directory.length) : undefined;
  return name && !name.includes("/") ? name : undefined;
}

function landsInsideRoots(token: ShellToken, context: ScreenContext, receivesEntries = false): boolean {
  // An unexpanded `$VAR` or glob has no single value here, so its destination is unknowable.
  if (token.expanded || token.wildcard) return false;
  // The kernel resolves `link/..` physically, from wherever the link points;
  // the containment check below resolves it textually.
  if (token.text.split("/").includes("..")) return false;
  if (isPermissionPolicyPath(token.text, context.cwd)) return false;
  if (isProtectedWritePath(token.text, context.cwd, receivesEntries)) return false;
  return isInsideAnyRoot(token.text, context.roots, context.cwd);
}

function placeOutput(token: ShellToken, context: ScreenContext): OutputPlacement {
  if (NULL_SINKS.has(token.text)) return "discarded";
  return landsInsideRoots(token, context) ? "contained" : "escaped";
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

    // Heredocs and `<` feed data in; `2>&1` only duplicates an existing descriptor.
    if (/^[0-9]*<(<-?)?$/.test(token.text) || /[<>]&[0-9-]*$/.test(token.text)) continue;

    const target = tokens[index + 1];
    if (!target || target.operator) return { contained: false, writesFile };

    const placement = placeOutput(target, context);
    if (placement === "escaped") return { contained: false, writesFile };
    if (placement === "contained") writesFile = true;
  }

  return { contained: true, writesFile };
}

function hasRejectedArgument(command: string, tokens: readonly ShellToken[]): boolean {
  const patterns = REJECTED_ARGUMENTS.get(command);
  if (!patterns) return false;

  return tokens.some((token) => patterns.some((pattern) => pattern.test(token.text)));
}

function isReadOnlyNpm(tokens: readonly ShellToken[], policy: PermissionPolicy): boolean {
  const subcommand = commandArguments(tokens)[1];
  return subcommand !== undefined && policy.shell.npmReadOnly.has(subcommand.text);
}

/** Folds what a segment's redirections do into what its command does. */
function withRedirections(effect: SegmentVerdict, verdict: SegmentVerdict): SegmentVerdict {
  if (verdict === "reject" || verdict === "copy") return verdict;
  return writes(effect) || writes(verdict) ? "write" : verdict;
}

/**
 * Removes the words that run no command of their own: structural shell syntax,
 * leading assignments, and wrappers such as `gtimeout 10` or `env -i`. What is
 * left is the command that actually runs, which is what gets judged.
 */
function toRunningCommand(tokens: readonly ShellToken[]): ShellToken[] | "header" | "reject" {
  let words = [...tokens];

  while (words[0] && !words[0].operator) {
    const text = words[0].text;

    // A `for`/`select` header runs nothing; the body is screened as its own segment.
    if (HEADER_WORDS.has(text)) return "header";

    if (ASSIGNMENT.test(text) || STRUCTURAL_WORDS.has(text)) {
      words.shift();
      continue;
    }

    const name = commandName(words[0]);
    if (name === undefined || !isWrapper(name)) break;

    const wrapped = unwrap(name, words);
    if (!wrapped) return "reject";
    words = wrapped;
  }

  return words;
}

/** `bash -c '...'` and `bash <<'EOF'` are as safe as the script they run. */
function nestedShellVerdict(
  words: readonly ShellToken[], context: ScreenContext, policy: PermissionPolicy, depth: number,
): SegmentVerdict {
  const script = readNestedScript(words);
  if (!script) return "reject";
  if (script.kind === "no-exec") return "read-only";
  if (depth >= MAX_NESTING) return "reject";

  const verdicts = screenLine(script.text, context, policy, depth + 1);
  if (!verdicts || !isApprovable(verdicts)) return "reject";
  // A `cd` inside the script ends with it; only its writes and staging carry out.
  if (verdicts.includes("copy")) return "copy";
  if (verdicts.includes("write")) return "write";
  return verdicts.includes("stage") ? "stage" : "read-only";
}

function screenSegment(
  tokens: readonly ShellToken[], context: ScreenContext, policy: PermissionPolicy, depth: number,
): SegmentVerdict {
  if (tokens.some((token) => looksSensitive(token.text) || hijacksLookup(token.text))) {
    return "reject";
  }

  const running = toRunningCommand(tokens);
  if (running === "reject") return "reject";
  if (running === "header") return "read-only";
  // A segment of assignments or shell syntax alone changes nothing on disk.
  if (running.length === 0) return "read-only";

  const command = commandName(running[0] as ShellToken);
  if (command === undefined) return "reject";

  const split = splitExecCommands(command, running);
  if (!split) return "reject";
  // What a finder runs on each match is a command of its own, and may only read.
  for (const run of split.runs) {
    if (depth >= MAX_NESTING || screenSegment(run, context, policy, depth + 1) !== "read-only") {
      return "reject";
    }
  }
  const words = split.own;

  if (hasRejectedArgument(command, words) || !keepsReadShape(command, words)) return "reject";

  const redirections = checkRedirections(words, context);
  if (!redirections.contained) return "reject";

  const effect: SegmentVerdict = redirections.writesFile ? "write" : "read-only";

  // `cd` anywhere is harmless on its own; what it would rebase is handled by
  // refusing to approve a chdir and a write in the same command line.
  if (command === "cd") return "chdir";

  if (policy.shell.builtins.has(command)) return effect;

  // `command -v foo` asks where a binary is; `command foo` runs it.
  if (command === "command") {
    const flag = words[1]?.text;
    return flag === "-v" || flag === "-V" ? effect : "reject";
  }

  if (command === "git") return withRedirections(effect, gitVerdict(words, policy));

  if (command === "npm") return isReadOnlyNpm(words, policy) ? effect : "reject";

  if (command === "curl") {
    return withRedirections(effect, curlVerdict(words, (token) => placeOutput(token, context)));
  }

  if (NESTED_SHELLS.has(command)) {
    return withRedirections(effect, nestedShellVerdict(words, context, policy, depth));
  }

  if (policy.shell.readOnly.has(command)) return effect;

  if (policy.shell.inRootWrite.has(command)) {
    // `sed -i script file`, `cp a b`, `mkdir dir`: every target has to be placeable.
    const targets = writeTargets(command, words);
    if (targets === undefined) return "reject";
    if (targets.length === 0) return effect;
    const copies = PLACES_LINKS.has(command);
    if (!targets.every((token) => landsInsideRoots(token, context, copies))) return "reject";
    return copies ? "copy" : "write";
  }

  if (isVersionOrHelpQuery(words)) return effect;

  return "reject";
}

/**
 * A command line is approvable when no segment is refused, and its writes were
 * checked against the tree they will really land in: not after a `cd` moved the
 * base of relative paths, and not alongside a copy that may place symlinks.
 */
function isApprovable(verdicts: readonly SegmentVerdict[]): boolean {
  if (verdicts.includes("reject")) return false;
  const writeCount = verdicts.filter(writes).length;
  if (verdicts.includes("chdir") && writeCount > 0) return false;
  return !(verdicts.includes("copy") && writeCount > 1);
}

function screenLine(
  command: string, context: ScreenContext, policy: PermissionPolicy, depth: number,
): SegmentVerdict[] | undefined {
  const reading = readCommand(command);
  if (!reading.readable) return undefined;

  const verdicts = reading.segments.map((segment) => screenSegment(segment, context, policy, depth));

  // A substitution runs before its line and only its output comes back. It may
  // read; a write would happen where the line's own checks never look.
  for (const inner of reading.substitutions) {
    const innerVerdicts = depth < MAX_NESTING ? screenLine(inner, context, policy, depth + 1) : undefined;
    const readsOnly = innerVerdicts?.every((verdict) => verdict === "read-only" || verdict === "chdir");
    if (!readsOnly) verdicts.push("reject");
  }

  return verdicts;
}

function screenCommand(command: string, context: ScreenContext): SegmentVerdict[] | undefined {
  const policy = context.policy ?? getPermissionPolicy();
  if (policy.problems.length > 0) return undefined;
  return screenLine(command, context, policy, 0);
}

/**
 * `true` when every segment of the command line is safe by construction.
 */
export function isAutoApprovedShellCommand(command: string, context: ScreenContext): boolean {
  const verdicts = screenCommand(command, context);
  return verdicts !== undefined && isApprovable(verdicts);
}

/** Used to distinguish policy inspection from policy modification. */
export function isReadOnlyShellCommand(command: string, context: ScreenContext): boolean {
  const verdicts = screenCommand(command, context);
  return verdicts !== undefined && verdicts.every((verdict) => verdict === "read-only" || verdict === "chdir");
}
