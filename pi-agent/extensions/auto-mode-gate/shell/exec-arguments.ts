/**
 * Separates the commands `find -exec` and `fd -x` run from the finder's own
 * arguments, so each can be screened as a command of its own.
 */

import type { ShellToken } from "./tokenize.ts";

interface ExecShape {
  flags: ReadonlySet<string>;
  /** Words that end the command; `fd` may also run to the end of the line. */
  terminators: ReadonlySet<string>;
  terminatorRequired: boolean;
}

const EXEC_SHAPES: ReadonlyMap<string, ExecShape> = new Map([
  ["find", { flags: new Set(["-exec", "-execdir"]), terminators: new Set([";", "+"]), terminatorRequired: true }],
  ["fd", {
    flags: new Set(["-x", "--exec", "-X", "--exec-batch"]),
    terminators: new Set([";"]),
    terminatorRequired: false,
  }],
]);

export interface ExecSplit {
  /** The finder's own words, with every exec flag and its command removed. */
  own: ShellToken[];
  /** Each command the finder runs, with its `{}` placeholders marked unknown. */
  runs: ShellToken[][];
}

/** `{}`, `{/}`, `{.}`, … stand for found paths, which can be anywhere. */
const PLACEHOLDER = /\{[^{}]*\}/;

export function splitExecCommands(command: string, words: readonly ShellToken[]): ExecSplit | undefined {
  const shape = EXEC_SHAPES.get(command);
  if (!shape) return { own: [...words], runs: [] };

  const own: ShellToken[] = [];
  const runs: ShellToken[][] = [];

  for (let index = 0; index < words.length; index += 1) {
    const token = words[index] as ShellToken;
    if (token.operator || !shape.flags.has(token.text)) {
      own.push(token);
      continue;
    }

    const run: ShellToken[] = [];
    let terminated = false;
    for (index += 1; index < words.length; index += 1) {
      const word = words[index] as ShellToken;
      if (word.operator) {
        index -= 1;
        break;
      }
      if (shape.terminators.has(word.text)) {
        terminated = true;
        break;
      }
      run.push(PLACEHOLDER.test(word.text) ? { ...word, expanded: true } : word);
    }

    if (run.length === 0 || (shape.terminatorRequired && !terminated)) return undefined;
    runs.push(run);
  }

  return { own, runs };
}
