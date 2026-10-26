/**
 * Argument shapes that keep a listed command in its safe form.
 *
 * The policy lists say which commands may skip the classifier; several of them
 * read in one shape and write, or leak secrets, in another. These checks
 * narrow a listed command to the shape its list entry assumes.
 */

import { type ShellToken, commandArguments } from "./tokenize.ts";

function isOption(token: ShellToken): boolean {
  return token.text.startsWith("-") && token.text !== "-";
}

/** Non-option arguments after the command name; everything after `--` counts. */
export function operandsOf(words: readonly ShellToken[]): ShellToken[] {
  const args = commandArguments(words).slice(1);
  const endOfOptions = args.findIndex((token) => token.text === "--");
  if (endOfOptions === -1) return args.filter((token) => !isOption(token));
  return [
    ...args.slice(0, endOfOptions).filter((token) => !isOption(token)),
    ...args.slice(endOfOptions + 1),
  ];
}

const ARITHMETIC_TEST = /^-(eq|ne|lt|le|gt|ge)$/;
const DEFAULTS_READS = new Set(["read", "read-type", "domains", "find", "help"]);

/** Read-only shapes, keyed by command; a command absent here has no shape limit. */
const READ_SHAPES: ReadonlyMap<string, (args: readonly ShellToken[]) => boolean> = new Map([
  ["plutil", (args) => {
    const mode = args[0]?.text;
    if (mode === "-p" || mode === "-lint" || mode === "-help") return true;
    // `-extract` writes back into the file unless sent to stdout.
    const output = args.findIndex((token) => token.text === "-o");
    return mode === "-extract" && output !== -1 && args[output + 1]?.text === "-";
  }],
  ["defaults", (args) => {
    const start = args[0]?.text === "-currentHost" ? 1 : 0;
    const verb = args[start]?.text;
    if (verb !== undefined && DEFAULTS_READS.has(verb)) return true;
    return verb === "export" && args.length === start + 3 && args[start + 2]?.text === "-";
  }],
  // `-e`, `-E`, and BSD-style `e` print every process's environment, secrets included.
  ["ps", (args) => !args.some((token, index) =>
    (/^-[A-Za-z]+$/.test(token.text) || (index === 0 && /^[A-Za-z]+$/.test(token.text))) &&
    /[eE]/.test(token.text))],
  // Bare `set` and `export` print the environment.
  ["set", (args) => args.length > 0],
  ["export", (args) => args.length > 0 && !args.some((token) => token.text === "-p")],
  // `[[ $x -eq 1 ]]` evaluates `$x` as arithmetic, and `a[$(cmd)]` in a value runs `cmd`.
  ["[[", (args) => !(args.some((token) => ARITHMETIC_TEST.test(token.text)) && args.some((token) => token.expanded))],
]);

export function keepsReadShape(command: string, words: readonly ShellToken[]): boolean {
  const shape = READ_SHAPES.get(command);
  return !shape || shape(commandArguments(words).slice(1));
}

/** `tool --version` or `tool --help`: a lookup any installed CLI answers without acting. */
export function isVersionOrHelpQuery(words: readonly ShellToken[]): boolean {
  const args = commandArguments(words).slice(1);
  return args.length === 1 && (args[0]?.text === "--version" || args[0]?.text === "--help");
}

/**
 * Writes that can place symlinks — `cp -R` and `mv` carry them along, `ln`
 * makes them. A later write in the same line could pass through one that does
 * not exist yet when the line is screened.
 */
export const PLACES_LINKS: ReadonlySet<string> = new Set(["cp", "mv", "ln"]);

/** Write commands that only print unless given this flag. */
const IN_PLACE_FLAGS: ReadonlyMap<string, RegExp> = new Map([
  ["sed", /^(-i|--in-place)/],
  ["gofmt", /^-w$/],
]);

/**
 * The paths a listed write command changes, or `undefined` when they cannot be
 * told apart. An empty list means the command does not write in this shape.
 */
export function writeTargets(command: string, words: readonly ShellToken[]): ShellToken[] | undefined {
  const inPlace = IN_PLACE_FLAGS.get(command);
  if (inPlace && !words.some((token) => inPlace.test(token.text))) return [];

  const operands = operandsOf(words);

  // A hard link would let a later in-root write change the file it shares.
  // A symbolic one is followed by every later containment check, as long as it
  // points inside a root too — so its source counts as a target.
  if (command === "ln" && !words.some((token) => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(token.text))) {
    return undefined;
  }

  // The first operand of `chmod` is the mode, not a path.
  const targets = command === "chmod" ? operands.slice(1) : operands;
  return targets.length > 0 ? targets : undefined;
}
