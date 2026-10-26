/**
 * Which `git` invocations are read-only.
 *
 * The policy lists the subcommands that may skip the classifier. Several of
 * them both list and change things depending on their arguments — `git branch`
 * lists, `git branch x` creates — so for those only the listing shape counts.
 */

import type { PermissionPolicy } from "../permission-policy.ts";
import { type ShellToken, commandArguments } from "./tokenize.ts";

export type GitVerdict = "read-only" | "stage" | "reject";

/**
 * Global options that leave the subcommand's meaning intact. `-C dir` only
 * picks the repository, like a `cd` that does not outlive the command. `-c` and
 * `--git-dir` are absent on purpose: config can name programs git then runs.
 */
const GLOBAL_FLAGS = new Set(["--no-pager", "-P", "--no-optional-locks", "--literal-pathspecs"]);

/** Listing options shared by `git branch` and `git tag`; `true` marks one that takes a commit. */
const LISTING_OPTIONS: ReadonlyMap<string, boolean> = new Map([
  ["-a", false], ["--all", false], ["-r", false], ["--remotes", false],
  ["-v", false], ["-vv", false], ["--verbose", false], ["-l", false], ["--list", false],
  ["--show-current", false], ["--no-color", false], ["--color", false], ["--column", false],
  ["--no-column", false], ["-i", false], ["--ignore-case", false], ["--no-abbrev", false],
  ["--contains", true], ["--no-contains", true], ["--merged", true], ["--no-merged", true],
  ["--points-at", true],
]);

/** `--format=…`, `--sort=…`, `-n5` (tag annotation lines) carry their value inline. */
const INLINE_LISTING_OPTION = /^(--format=|--sort=|--abbrev=|--color=|--column=|-n[0-9]*$)/;

/** `git branch` / `git tag` that only list: a bare name creates one. */
function isListing(args: readonly ShellToken[]): boolean {
  const listsByPattern = args.some((token) => token.text === "-l" || token.text === "--list");

  for (let index = 0; index < args.length; index += 1) {
    const text = (args[index] as ShellToken).text;
    const takesCommit = LISTING_OPTIONS.get(text.split("=")[0] as string);

    if (takesCommit !== undefined) {
      if (takesCommit && !text.includes("=")) index += 1;
      continue;
    }
    if (INLINE_LISTING_OPTION.test(text)) continue;
    if (text.startsWith("-")) return false;
    // A pattern after `--list`; anything else would name a new branch or tag.
    if (!listsByPattern) return false;
  }
  return true;
}

const CONFIG_READS = /^(--get|--get-all|--get-regexp|--get-urlmatch|--list|-l)$/;
const CONFIG_WRITES = /^(--add|--replace-all|--unset.*|--rename-section|--remove-section|-e|--edit)$/;

/** Read shapes of subcommands that can also write. */
const SHAPES: ReadonlyMap<string, (args: readonly ShellToken[]) => boolean> = new Map([
  ["branch", isListing],
  ["tag", isListing],
  ["stash", (args) => args[0]?.text === "list" || args[0]?.text === "show"],
  ["worktree", (args) => args[0]?.text === "list"],
  ["reflog", (args) => !args[0] || args[0].text.startsWith("-") || args[0].text === "show" || args[0].text === "exists"],
  ["config", (args) =>
    args[0]?.text === "get" || args[0]?.text === "list" ||
    (args.some((token) => CONFIG_READS.test(token.text)) && !args.some((token) => CONFIG_WRITES.test(token.text)))],
  // One operand reads where a symbolic ref points; two would repoint it.
  ["symbolic-ref", (args) =>
    !args.some((token) => /^(-d|--delete|-m)$/.test(token.text)) &&
    args.filter((token) => !token.text.startsWith("-")).length <= 1],
]);

export function gitVerdict(tokens: readonly ShellToken[], policy: PermissionPolicy): GitVerdict {
  const words = commandArguments(tokens);

  let index = 1;
  while (words[index]) {
    const text = (words[index] as ShellToken).text;
    if (GLOBAL_FLAGS.has(text)) {
      index += 1;
    } else if (text === "-C" && words[index + 1]) {
      index += 2;
    } else {
      break;
    }
  }

  const subcommand = words[index];
  // Any other global option before the subcommand (`git -c ...`) can change what runs.
  if (!subcommand || subcommand.text.startsWith("-")) return "reject";

  const args = words.slice(index + 1);
  const name = subcommand.text;

  if (name === "remote") {
    return policy.shell.gitRemoteReadOnly.has(args[0]?.text) ? "read-only" : "reject";
  }
  // Staging only moves files into the index of the repository already in scope.
  if (policy.shell.gitInRootWrite.has(name)) return "stage";
  if (!policy.shell.gitReadOnly.has(name)) return "reject";

  const shape = SHAPES.get(name);
  return !shape || shape(args) ? "read-only" : "reject";
}
