/**
 * Commands that run another command with the same effects. The screener strips
 * them and judges what they wrap, so `gtimeout 10 rg foo` is screened as `rg`.
 *
 * Each wrapper lists the options it may carry; any other option is refused,
 * since some change what runs: `env -S` re-splits a string into a new command,
 * `env -P` searches a different PATH, and `env -C` moves the working directory.
 */

import type { ShellToken } from "./tokenize.ts";

interface WrapperShape {
  /** Option name → whether it takes a value, as `-k 5`, `-k5`, or `--kill-after=5`. */
  options: ReadonlyMap<string, boolean>;
  /** `timeout` takes a duration before the command; the others take nothing. */
  duration: boolean;
}

const TIMEOUT: WrapperShape = {
  options: new Map([
    ["-k", true], ["--kill-after", true], ["-s", true], ["--signal", true],
    ["--foreground", false], ["--preserve-status", false], ["-v", false], ["--verbose", false],
  ]),
  duration: true,
};

const WRAPPERS: ReadonlyMap<string, WrapperShape> = new Map([
  ["env", { options: new Map([["-i", false], ["--ignore-environment", false], ["-u", true], ["--unset", true]]), duration: false }],
  ["gtimeout", TIMEOUT],
  ["timeout", TIMEOUT],
  ["nice", { options: new Map([["-n", true], ["--adjustment", true]]), duration: false }],
  ["stdbuf", { options: new Map([["-i", true], ["-o", true], ["-e", true]]), duration: false }],
  ["time", { options: new Map([["-p", false]]), duration: false }],
]);

/** Looks like a `timeout` duration: `10`, `1.5`, `2m`. */
const DURATION = /^[0-9]+(\.[0-9]+)?[smhd]?$/;

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function isWrapper(name: string): boolean {
  return WRAPPERS.has(name);
}

/** Length of the option at `words[index]` including its value, or 0 when it is not allowed. */
function optionLength(words: readonly ShellToken[], index: number, shape: WrapperShape): number {
  const text = (words[index] as ShellToken).text;

  const longName = text.startsWith("--") ? text.split("=")[0] as string : undefined;
  if (longName !== undefined) {
    const takesValue = shape.options.get(longName);
    if (takesValue === undefined) return 0;
    if (!takesValue || text.includes("=")) return 1;
    return words[index + 1] && !words[index + 1]?.operator ? 2 : 0;
  }

  // `nice -5` is the historical spelling of `nice -n 5`.
  if (shape === WRAPPERS.get("nice") && /^-[0-9]+$/.test(text)) return 1;

  const shortName = text.slice(0, 2);
  const takesValue = shape.options.get(shortName);
  if (takesValue === undefined) return 0;
  if (text.length > 2) return takesValue ? 1 : 0;
  if (!takesValue) return 1;
  return words[index + 1] && !words[index + 1]?.operator ? 2 : 0;
}

/**
 * The words after the wrapper and its own arguments, or `undefined` when the
 * wrapper carries an option it is not known to pass through unchanged, or wraps
 * nothing at all — a bare `env` prints the environment, secrets included.
 */
export function unwrap(name: string, words: readonly ShellToken[]): ShellToken[] | undefined {
  const shape = WRAPPERS.get(name);
  if (!shape) return undefined;

  let index = 1;
  while (words[index] && !words[index]?.operator) {
    const text = (words[index] as ShellToken).text;
    if (text === "--") {
      index += 1;
      break;
    }
    if (!text.startsWith("-") || text === "-") break;
    const length = optionLength(words, index, shape);
    if (length === 0) return undefined;
    index += length;
  }

  if (name === "env") {
    while (words[index] && ASSIGNMENT.test((words[index] as ShellToken).text)) index += 1;
  }

  if (shape.duration) {
    if (!words[index] || !DURATION.test((words[index] as ShellToken).text)) return undefined;
    index += 1;
  }

  const rest = words.slice(index);
  return rest.length > 0 && !rest[0]?.operator ? rest : undefined;
}
