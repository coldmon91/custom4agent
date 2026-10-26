/**
 * Finds the script a `bash` or `sh` invocation runs, so it can be screened like
 * any other command line: `bash -c '...'`, or a script fed in through a
 * heredoc. A script file, a script built from variables, or one arriving
 * through a pipe stays unknown.
 */

import type { ShellToken } from "./tokenize.ts";

export const NESTED_SHELLS: ReadonlySet<string> = new Set(["bash", "sh"]);

export type NestedScript =
  | { kind: "script"; text: string }
  /** `-n` parses without running anything. */
  | { kind: "no-exec" };

/** `set -o` names that only make the script stricter or noisier. */
const SET_OPTIONS = new Set(["pipefail", "errexit", "nounset", "xtrace", "verbose", "noglob", "noclobber"]);

/** Single-letter options that change nothing a screen of the script relies on. */
const NEUTRAL_LETTERS = new Set("euxvfs".split(""));

const LONG_OPTIONS = new Set(["--norc", "--noprofile", "--posix"]);

export function readNestedScript(words: readonly ShellToken[]): NestedScript | undefined {
  let runsArgument = false;
  let noExec = false;
  let script: ShellToken | undefined;
  let index = 1;

  while (index < words.length) {
    const token = words[index] as ShellToken;
    if (token.operator) break;
    index += 1;

    if (LONG_OPTIONS.has(token.text)) continue;

    if (/^-[a-z]+$/.test(token.text)) {
      for (const letter of token.text.slice(1)) {
        if (letter === "c") {
          runsArgument = true;
        } else if (letter === "n") {
          noExec = true;
        } else if (letter === "o") {
          const name = words[index];
          if (!name || name.operator || !SET_OPTIONS.has(name.text)) return undefined;
          index += 1;
        } else if (!NEUTRAL_LETTERS.has(letter)) {
          return undefined;
        }
      }
      continue;
    }

    // The first operand is the script; with `-c` it is the script's text, and
    // what follows becomes `$0`, `$1`, … — data, already unknown inside it.
    script = token;
    break;
  }

  if (noExec) return { kind: "no-exec" };

  if (runsArgument) {
    if (!script || script.expanded) return undefined;
    return { kind: "script", text: script.text };
  }

  // A script file cannot be read from here.
  if (script) return undefined;

  const heredoc = words.find((token) => token.operator && token.heredoc)?.heredoc;
  return heredoc?.literal ? { kind: "script", text: heredoc.body } : undefined;
}
