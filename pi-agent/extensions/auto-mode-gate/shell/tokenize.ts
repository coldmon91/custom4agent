/**
 * A deliberately small POSIX-shell reader for the screener.
 *
 * It only has to answer one question: can this command line be understood well
 * enough to vouch for it? Anything it cannot read confidently — backticks,
 * process substitution, arithmetic, an unterminated quote — is reported as
 * unreadable so the caller falls back to the classifier. Being wrong in that
 * direction costs a model call; being wrong the other way runs an unscreened
 * command.
 */

import { homedir } from "node:os";

/** One word or operator of a command. */
export interface ShellToken {
  text: string;
  /** Redirection and separator symbols carry no path of their own. */
  operator: boolean;
  /** `true` when the word contained `$VAR` or `$(...)`, so its literal value is unknown. */
  expanded: boolean;
  /** `true` when an unquoted glob or brace pattern lets the shell turn the word into other paths. */
  wildcard: boolean;
  /** Body of the heredoc a `<<` operator opens. */
  heredoc?: Heredoc;
}

export interface Heredoc {
  body: string;
  /** `true` when the shell passes the body through without expanding anything in it. */
  literal: boolean;
}

export type Segmentation =
  | {
      readable: true;
      segments: ShellToken[][];
      /** Inner command lines of every `$(...)`, which the shell runs before the line itself. */
      substitutions: string[];
    }
  | { readable: false; reason: string };

/** Operators that end one command and start the next. */
const SEPARATORS = new Set([";", "|", "&&", "||", "\n"]);

const REDIRECTION = /^(?:[0-9]*(?:>>?|<)|&>>?|[0-9]*>&[0-9-]*|[0-9]*<&[0-9-]*)$/;

const BRACE_EXPANSION = /\{[^{}]*(?:,|\.\.)[^{}]*\}/;

function isRedirection(text: string): boolean {
  return REDIRECTION.test(text);
}

export function isOperatorText(text: string): boolean {
  return SEPARATORS.has(text) || isRedirection(text) || text === "<<" || text === "<<-";
}

/** The words a command receives as arguments: redirections and their targets removed. */
export function commandArguments(tokens: readonly ShellToken[]): ShellToken[] {
  const words: ShellToken[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] as ShellToken;
    if (!token.operator) {
      words.push(token);
      continue;
    }
    // `2>&1` names no file, and a heredoc's delimiter is not kept as a token.
    if (isRedirection(token.text) && !token.text.includes("&")) index += 1;
    if (token.text.startsWith("&>")) index += 1;
  }
  return words;
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

interface PendingHeredoc {
  delimiter: string;
  quoted: boolean;
  operator: ShellToken;
}

type Failure = { ok: false; reason: string };

/**
 * Splits a command line into segments of tokens.
 *
 * Heredoc bodies are not parsed as commands: their content is data the command
 * receives. They are kept on the `<<` token so a shell reading its script from
 * one can still be screened.
 */
export function readCommand(command: string): Segmentation {
  const state: ReaderState = { tokens: [], segments: [] };
  const substitutions: string[] = [];

  let word = "";
  let wordStarted = false;
  let expanded = false;
  /** Characters that reached the word unquoted and unescaped, where globbing applies. */
  let unquoted = "";
  let leadingTilde = false;
  let pendingHeredocs: PendingHeredoc[] = [];
  let index = 0;

  const flushWord = () => {
    if (!wordStarted) return;

    let text = word;
    if (leadingTilde) {
      // `~` and `~/x` name the home directory; `~user` is someone else's, unknown here.
      if (text === "~" || text.startsWith("~/")) text = homedir() + text.slice(1);
      else expanded = true;
    }

    const wildcard = /[*?[]/.test(unquoted) || BRACE_EXPANSION.test(unquoted);
    state.tokens.push({ text, operator: false, expanded, wildcard });
    word = "";
    wordStarted = false;
    expanded = false;
    unquoted = "";
    leadingTilde = false;
  };

  const pushOperator = (text: string): ShellToken | undefined => {
    flushWord();
    if (SEPARATORS.has(text)) {
      pushSegment(state);
      return undefined;
    }
    const token: ShellToken = { text, operator: true, expanded: false, wildcard: false };
    state.tokens.push(token);
    return token;
  };

  /** Consumes the heredoc bodies once the line that opened them ends. */
  const readHeredocBodies = (): Failure | undefined => {
    for (const pending of pendingHeredocs) {
      const lines: string[] = [];
      while (index < command.length) {
        const lineEnd = command.indexOf("\n", index);
        const line = command.slice(index, lineEnd === -1 ? command.length : lineEnd);
        index = lineEnd === -1 ? command.length : lineEnd + 1;
        // Ending early on a looser match only means later lines get screened as commands.
        if (line.trim() === pending.delimiter) break;
        lines.push(line);
      }

      const body = lines.join("\n");
      // An unquoted delimiter makes the shell run substitutions inside the body.
      if (!pending.quoted && UNSAFE_HEREDOC_EXPANSION.test(body)) {
        return { ok: false, reason: "expansion inside heredoc" };
      }
      pending.operator.heredoc = { body, literal: pending.quoted || !/[$`\\]/.test(body) };
    }
    pendingHeredocs = [];
    return undefined;
  };

  while (index < command.length) {
    const char = command[index] as string;

    if (char === "#" && !wordStarted) {
      const lineEnd = command.indexOf("\n", index);
      index = lineEnd === -1 ? command.length : lineEnd;
      continue;
    }

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
      const closed = readDoubleQuoted(command, index, substitutions);
      if (!closed.ok) return { readable: false, reason: closed.reason };
      word += closed.text;
      wordStarted = true;
      expanded = expanded || closed.expanded;
      index = closed.next;
      continue;
    }

    if (char === "$") {
      const expansion = readDollar(command, index, substitutions);
      if (!expansion.ok) return { readable: false, reason: expansion.reason };
      word += expansion.text;
      wordStarted = true;
      expanded = true;
      index = expansion.next;
      continue;
    }

    if (char === "`") return { readable: false, reason: "backtick substitution" };

    if ((char === "<" || char === ">") && command[index + 1] === "(") {
      return { readable: false, reason: "process substitution" };
    }

    if (char === "\n") {
      pushOperator("\n");
      index += 1;
      if (pendingHeredocs.length > 0) {
        const failure = readHeredocBodies();
        if (failure) return { readable: false, reason: failure.reason };
      }
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

      const token = pushOperator(operator.text);
      index = operator.next;

      if (token && (operator.text === "<<" || operator.text === "<<-")) {
        const delimiter = readHeredocDelimiter(command, index);
        if (!delimiter) return { readable: false, reason: "unreadable heredoc delimiter" };
        pendingHeredocs.push({ delimiter: delimiter.text, quoted: delimiter.quoted, operator: token });
        index = delimiter.next;
      }
      continue;
    }

    if (!wordStarted && char === "~") leadingTilde = true;
    word += char;
    unquoted += char;
    wordStarted = true;
    index += 1;
  }

  flushWord();
  pushSegment(state);

  // A heredoc opened on the last line has no body; the shell would reject it.
  if (pendingHeredocs.length > 0) return { readable: false, reason: "unterminated heredoc" };
  if (state.segments.length === 0) return { readable: false, reason: "empty command" };

  return { readable: true, segments: state.segments, substitutions };
}

/** Substitutions and arithmetic the shell would evaluate inside an unquoted heredoc body. */
const UNSAFE_HEREDOC_EXPANSION = /`|\$\(|\$\[|\$\{[^}]*[!:[]/;

type Expansion = { ok: true; text: string; next: number } | Failure;

/**
 * Reads one `$` expansion. Command substitution is kept for the caller to
 * screen; arithmetic is refused outright, because the shell evaluates variable
 * values inside it as expressions — and `a[$(cmd)]` in a value runs `cmd`.
 */
function readDollar(command: string, start: number, substitutions: string[]): Expansion {
  const next = command[start + 1];

  if (next === "(") {
    if (command[start + 2] === "(") return { ok: false, reason: "arithmetic expansion" };
    const end = findSubstitutionEnd(command, start + 2);
    if (end === undefined) return { ok: false, reason: "unreadable command substitution" };
    substitutions.push(command.slice(start + 2, end));
    return { ok: true, text: command.slice(start, end + 1), next: end + 1 };
  }

  if (next === "[") return { ok: false, reason: "arithmetic expansion" };

  if (next === "{") {
    const end = command.indexOf("}", start + 2);
    if (end === -1) return { ok: false, reason: "unterminated parameter expansion" };
    const body = command.slice(start + 2, end);
    // Indirection, subscripts, and substring offsets are evaluated as arithmetic;
    // a nested substitution would run, and quotes or nested braces would make
    // the closing brace uncertain. A plain `$NAME` default is fine.
    if (/^!|\[|:(?![-=+?])|`|\$[({[]|['"\\]/.test(body)) {
      return { ok: false, reason: "parameter expansion with evaluation" };
    }
    return { ok: true, text: command.slice(start, end + 1), next: end + 1 };
  }

  return { ok: true, text: "$", next: start + 1 };
}

/**
 * Index of the `)` closing a `$(` whose body starts at `start`. Quotes,
 * escapes, comments, and nested substitutions are skipped so their parentheses
 * do not count.
 */
function findSubstitutionEnd(command: string, start: number): number | undefined {
  let depth = 1;

  for (let index = start; index < command.length; index += 1) {
    const char = command[index] as string;

    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      if (end === -1) return undefined;
      index = end;
      continue;
    }
    if (char === '"') {
      const end = findDoubleQuoteEnd(command, index + 1);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    if (char === "`") return undefined;
    if (char === "#" && (index === start || /[\s;|&(]/.test(command[index - 1] as string))) {
      const lineEnd = command.indexOf("\n", index);
      if (lineEnd === -1) return undefined;
      index = lineEnd;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return undefined;
}

/** Index of the `"` closing a double-quoted string whose body starts at `start`. */
function findDoubleQuoteEnd(command: string, start: number): number | undefined {
  for (let index = start; index < command.length; index += 1) {
    const char = command[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "`") return undefined;
    if (char === "$" && command[index + 1] === "(") {
      const end = findSubstitutionEnd(command, index + 2);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }
    if (char === '"') return index;
  }
  return undefined;
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
  substitutions: string[],
): DoubleQuoted | Failure {
  let text = "";
  let expanded = false;
  let index = start + 1;

  while (index < command.length) {
    const char = command[index] as string;

    if (char === "\\") {
      const next = command[index + 1];
      if (next === undefined) return { ok: false, reason: "trailing backslash" };
      // Inside double quotes a backslash escapes only these; before anything else
      // it stays, and a nested `bash -c` script must see it to parse the same way.
      // A line continuation disappears entirely.
      if (next !== "\n") text += '$`"\\'.includes(next) ? next : char + next;
      index += 2;
      continue;
    }

    if (char === "`") return { ok: false, reason: "backtick substitution" };

    if (char === "$") {
      const expansion = readDollar(command, index, substitutions);
      if (!expansion.ok) return expansion;
      text += expansion.text;
      expanded = true;
      index = expansion.next;
      continue;
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
): { text: string; quoted: boolean; next: number } | undefined {
  const match = /^[ \t]*(?:'([^']*)'|"([^"]*)"|([A-Za-z0-9_.-]+))/.exec(command.slice(index));
  if (!match) return undefined;

  const text = match[1] ?? match[2] ?? match[3];
  if (!text) return undefined;

  return { text, quoted: match[3] === undefined, next: index + match[0].length };
}
