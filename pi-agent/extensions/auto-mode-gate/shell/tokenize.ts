/**
 * A deliberately small POSIX-shell reader for the screener.
 *
 * It only has to answer one question: can this command line be understood well
 * enough to vouch for it? Anything it cannot read confidently — command
 * substitution, process substitution, an unterminated quote — is reported as
 * unreadable so the caller falls back to the classifier. Being wrong in that
 * direction costs a model call; being wrong the other way runs an unscreened
 * command.
 */

/** One word or operator of a command. */
export interface ShellToken {
  text: string;
  /** Redirection and separator symbols carry no path of their own. */
  operator: boolean;
  /** `true` when the word contained `$VAR`, so its literal value is unknown. */
  expanded: boolean;
}

export type Segmentation =
  | { readable: true; segments: ShellToken[][] }
  | { readable: false; reason: string };

/** Operators that end one command and start the next. */
const SEPARATORS = new Set([";", "|", "&&", "||", "\n"]);

const REDIRECTION = /^(?:[0-9]*(?:>>?|<)|&>>?|[0-9]*>&[0-9-]*|[0-9]*<&[0-9-]*)$/;

function isRedirection(text: string): boolean {
  return REDIRECTION.test(text);
}

export function isOperatorText(text: string): boolean {
  return SEPARATORS.has(text) || isRedirection(text) || text === "<<" || text === "<<-";
}

interface ReaderState {
  tokens: ShellToken[];
  segments: ShellToken[][];
}

function pushSegment(state: ReaderState): void {
  if (state.tokens.length > 0) {
    state.segments.push(state.tokens);
    state.tokens = [];
  }
}

/**
 * Splits a command line into segments of tokens.
 *
 * Heredoc bodies are skipped rather than parsed: their content is data the
 * command receives, not commands the shell runs.
 */
export function readCommand(command: string): Segmentation {
  const state: ReaderState = { tokens: [], segments: [] };

  let word = "";
  let wordStarted = false;
  let expanded = false;
  /** Delimiters of heredocs opened on the current line, in order. */
  let pendingHeredocs: string[] = [];
  let index = 0;

  const flushWord = () => {
    if (!wordStarted) return;
    state.tokens.push({ text: word, operator: false, expanded });
    word = "";
    wordStarted = false;
    expanded = false;
  };

  const pushOperator = (text: string) => {
    flushWord();
    if (SEPARATORS.has(text)) {
      pushSegment(state);
      return;
    }
    state.tokens.push({ text, operator: true, expanded: false });
  };

  /** Consumes a heredoc body once the line that opened it ends. */
  const skipHeredocBodies = () => {
    for (const delimiter of pendingHeredocs) {
      while (index < command.length) {
        const lineEnd = command.indexOf("\n", index);
        const line = command.slice(index, lineEnd === -1 ? command.length : lineEnd);
        index = lineEnd === -1 ? command.length : lineEnd + 1;
        // `<<-` strips leading tabs from the terminator as well as the body.
        if (line.trim() === delimiter) break;
      }
    }
    pendingHeredocs = [];
  };

  while (index < command.length) {
    const char = command[index] as string;

    if (char === "\\") {
      const next = command[index + 1];
      if (next === undefined) return { readable: false, reason: "trailing backslash" };
      // A line continuation joins the two lines; anything else is a literal.
      if (next !== "\n") {
        word += next;
        wordStarted = true;
      }
      index += 2;
      continue;
    }

    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      if (end === -1) return { readable: false, reason: "unterminated single quote" };
      word += command.slice(index + 1, end);
      wordStarted = true;
      index = end + 1;
      continue;
    }

    if (char === '"') {
      const closed = readDoubleQuoted(command, index);
      if (!closed.ok) return { readable: false, reason: closed.reason };
      word += closed.text;
      wordStarted = true;
      expanded = expanded || closed.expanded;
      index = closed.next;
      continue;
    }

    if (char === "$") {
      const next = command[index + 1];
      if (next === "(") return { readable: false, reason: "command substitution" };
      word += char;
      wordStarted = true;
      expanded = true;
      index += 1;
      continue;
    }

    if (char === "`") return { readable: false, reason: "command substitution" };

    if ((char === "<" || char === ">") && command[index + 1] === "(") {
      return { readable: false, reason: "process substitution" };
    }

    if (char === "\n") {
      pushOperator("\n");
      index += 1;
      if (pendingHeredocs.length > 0) skipHeredocBodies();
      continue;
    }

    if (char === " " || char === "\t" || char === "\r") {
      flushWord();
      index += 1;
      continue;
    }

    const operator = readOperator(command, index);
    if (operator) {
      if (operator.text === "&") return { readable: false, reason: "background execution" };
      if (operator.text === "<<<") return { readable: false, reason: "here-string" };

      pushOperator(operator.text);
      index = operator.next;

      if (operator.text === "<<" || operator.text === "<<-") {
        const delimiter = readHeredocDelimiter(command, index);
        if (!delimiter) return { readable: false, reason: "unreadable heredoc delimiter" };
        pendingHeredocs.push(delimiter.text);
        index = delimiter.next;
      }
      continue;
    }

    word += char;
    wordStarted = true;
    index += 1;
  }

  flushWord();
  pushSegment(state);

  if (state.segments.length === 0) return { readable: false, reason: "empty command" };

  return { readable: true, segments: state.segments };
}

interface DoubleQuoted {
  ok: true;
  text: string;
  expanded: boolean;
  next: number;
}

function readDoubleQuoted(
  command: string,
  start: number,
): DoubleQuoted | { ok: false; reason: string } {
  let text = "";
  let expanded = false;
  let index = start + 1;

  while (index < command.length) {
    const char = command[index] as string;

    if (char === "\\") {
      const next = command[index + 1];
      if (next === undefined) return { ok: false, reason: "trailing backslash" };
      text += next;
      index += 2;
      continue;
    }

    if (char === "`") return { ok: false, reason: "command substitution" };

    if (char === "$") {
      if (command[index + 1] === "(") return { ok: false, reason: "command substitution" };
      expanded = true;
    }

    if (char === '"') return { ok: true, text, expanded, next: index + 1 };

    text += char;
    index += 1;
  }

  return { ok: false, reason: "unterminated double quote" };
}

/** Longest-first so `&&` is never read as two `&`, and `<<-` never as `<<`. */
const OPERATORS = ["<<<", "<<-", "&>>", "&&", "||", ">>", "<<", "&>", ">", "<", "|", ";", "&"];

function readOperator(command: string, index: number): { text: string; next: number } | undefined {
  // A file descriptor prefix belongs to the redirection it introduces: `2>&1`.
  const fdMatch = /^[0-9]+(?=[<>])/.exec(command.slice(index));
  const offset = fdMatch ? fdMatch[0].length : 0;
  const rest = command.slice(index + offset);

  for (const operator of OPERATORS) {
    if (!rest.startsWith(operator)) continue;

    // `2>&1` and `>&2` duplicate a descriptor; keep them as one token.
    const duplicate = /^[<>]&[0-9-]+/.exec(rest);
    const text = duplicate ? duplicate[0] : operator;

    return { text: `${fdMatch?.[0] ?? ""}${text}`, next: index + offset + text.length };
  }

  return undefined;
}

/** Reads the word after `<<`, which may be quoted to disable expansion. */
function readHeredocDelimiter(
  command: string,
  index: number,
): { text: string; next: number } | undefined {
  const match = /^[ \t]*(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_.-]+))/.exec(command.slice(index));
  if (!match) return undefined;

  const text = match[1] ?? match[2] ?? match[3];
  if (!text) return undefined;

  return { text, next: index + match[0].length };
}
