/**
 * `curl` in its reading shape: a GET or HEAD over HTTP(S) that sends nothing
 * local and writes only to stdout or a path the caller can place.
 *
 * Options are allow-listed rather than deny-listed: curl has hundreds, and
 * enough of them upload, authenticate, or write files that an unknown one is
 * safer refused.
 */

import { type ShellToken, commandArguments } from "./tokenize.ts";

/** Where an output path sends data, as decided by the caller's trusted roots. */
export type OutputPlacement = "discarded" | "contained" | "escaped";

export type CurlVerdict = "read-only" | "write" | "reject";

const SHORT_FLAGS = new Set("sSLfiIvk46gNG#".split(""));

const LONG_FLAGS = new Set([
  "--silent", "--show-error", "--location", "--fail", "--fail-with-body", "--include", "--head",
  "--verbose", "--insecure", "--compressed", "--ipv4", "--ipv6", "--globoff", "--no-buffer",
  "--progress-bar", "--no-progress-meter", "--http1.1", "--http2", "--get",
]);

type ValueKind = "plain" | "method" | "header" | "output" | "write-out";

const SHORT_VALUES: ReadonlyMap<string, ValueKind> = new Map([
  ["m", "plain"], ["A", "plain"], ["e", "plain"], ["r", "plain"],
  ["X", "method"], ["H", "header"], ["o", "output"], ["D", "output"], ["w", "write-out"],
]);

const LONG_VALUES: ReadonlyMap<string, ValueKind> = new Map([
  ["--max-time", "plain"], ["--connect-timeout", "plain"], ["--retry", "plain"],
  ["--retry-delay", "plain"], ["--retry-max-time", "plain"], ["--max-redirs", "plain"],
  ["--max-filesize", "plain"], ["--user-agent", "plain"], ["--referer", "plain"],
  ["--range", "plain"], ["--url", "plain"],
  ["--request", "method"], ["--header", "header"], ["--output", "output"],
  ["--dump-header", "output"], ["--write-out", "write-out"],
]);

/** A header whose name suggests it carries a credential. */
const CREDENTIAL_HEADER = /^[^:]*(auth|cookie|token|key|secret|session|password)/i;

/** Plain HTTP(S) only: `telnet://` sends stdin, `smtp://` mails, `file://` is fine but unneeded. */
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

function isAcceptedValue(
  kind: ValueKind,
  token: ShellToken,
  place: (token: ShellToken) => OutputPlacement,
): "ok" | "writes" | "reject" {
  switch (kind) {
    case "plain":
      return "ok";
    case "method":
      return token.text === "GET" || token.text === "HEAD" ? "ok" : "reject";
    case "header":
      // `@file` reads headers from a local file and sends them.
      return token.expanded || token.text.startsWith("@") || CREDENTIAL_HEADER.test(token.text)
        ? "reject"
        : "ok";
    case "write-out":
      return /%output\{/.test(token.text) ? "reject" : "ok";
    case "output": {
      if (token.text === "-") return "ok";
      const placement = place(token);
      if (placement === "escaped") return "reject";
      return placement === "contained" ? "writes" : "ok";
    }
  }
}

export function curlVerdict(
  tokens: readonly ShellToken[],
  place: (token: ShellToken) => OutputPlacement,
): CurlVerdict {
  const words = commandArguments(tokens).slice(1);
  let writes = false;

  for (let index = 0; index < words.length; index += 1) {
    const token = words[index] as ShellToken;
    const text = token.text;

    let kind: ValueKind | undefined;
    let inlineValue: string | undefined;

    if (text.startsWith("--")) {
      if (LONG_FLAGS.has(text)) continue;
      kind = LONG_VALUES.get(text);
      if (!kind) return "reject";
    } else if (text.startsWith("-") && text.length > 1) {
      // `-sSLo out`: flags clustered ahead of at most one option taking a value.
      for (let letter = 1; letter < text.length; letter += 1) {
        const char = text[letter] as string;
        if (SHORT_FLAGS.has(char)) continue;
        kind = SHORT_VALUES.get(char);
        if (!kind) return "reject";
        inlineValue = text.slice(letter + 1) || undefined;
        break;
      }
      if (!kind) continue;
    } else {
      const scheme = SCHEME.exec(text)?.[1]?.toLowerCase();
      if (scheme !== undefined && scheme !== "http" && scheme !== "https") return "reject";
      continue;
    }

    let value: ShellToken | undefined;
    if (inlineValue !== undefined) {
      value = { ...token, text: inlineValue };
    } else {
      value = words[index + 1];
      index += 1;
    }
    if (!value) return "reject";

    const accepted = isAcceptedValue(kind, value, place);
    if (accepted === "reject") return "reject";
    if (accepted === "writes") writes = true;
  }

  return writes ? "write" : "read-only";
}
