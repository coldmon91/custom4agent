/** Fixed shell syntax, dangerous arguments, and credential checks. */

/**
 * Shell syntax that runs no command of its own. Skipping these words lets the
 * screener reach the commands inside a loop or conditional and judge those.
 */
export const STRUCTURAL_WORDS: ReadonlySet<string> = new Set([
  "!",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "if",
  "then",
  "until",
  "while",
  "{",
  "}",
]);

/** Words whose whole segment is a loop or case header, so nothing runs in it. */
export const HEADER_WORDS: ReadonlySet<string> = new Set(["case", "for", "select"]);

/**
 * Commands that run another command with the same effects. The screener strips
 * them and judges what they wrap, so `gtimeout 10 rg foo` is screened as `rg`.
 */
export const COMMAND_PREFIXES: ReadonlySet<string> = new Set([
  "env",
  "gtimeout",
  "nice",
  "stdbuf",
  "timeout",
]);

/**
 * Flags that turn `curl` from a GET into an upload, a file write, or an
 * authenticated call. Without them it is a read the ruleset already allows.
 */
export const REJECTED_CURL_FLAGS: readonly RegExp[] = [
  /^(-d|--data.*|-F|--form.*|-T|--upload-file)$/,
  /^(-o|--output.*|-O|--remote-name.*|--create-dirs)$/,
  /^(-X|--request)$/,
  /^(-u|--user|--netrc.*|-E|--cert.*|--key)$/,
  /^(-H|--header|-K|--config)$/,
  /^(--libcurl|--trace.*|--dump-header|-D)$/,
];

/**
 * `awk` and `find` can act well outside their read-only shape. Rather than
 * interpret their programs, the screener rejects the flags that do so.
 */
export const REJECTED_ARGUMENTS: ReadonlyMap<string, readonly RegExp[]> = new Map([
  ["awk", [/(^|[^\\])>/, /system\s*\(/, /\bprint\s*>/, /-v\s*ENVIRON/]],
  ["find", [/^-(delete|exec|execdir|ok|okdir|fprint.*|fls|fprintf)$/]],
  ["fd", [/^(-x|-X|--exec|--exec-batch)$/]],
  // sed writes files without `-i` too: `/re/w out` and the `s///w` flag.
  ["sed", [/\/w\s+\S/, /^s(.).*\1.*\1[a-zA-Z]*w/]],
  ["grep", [/^(--file|-f)$/]],
  ["rg", [/^(--pre|--hostname-bin)$/]],
  ["jq", [/^(--args|--jsonargs)$/]],
]);

/**
 * Environment variables that change which binary a later command actually runs,
 * or inject code into it. A segment that sets one is not screenable: the names
 * in it would no longer mean what this policy assumes.
 */
const HIJACKING_ASSIGNMENT =
  /^(PATH|IFS|ENV|BASH_ENV|SHELL|LD_[A-Z_]+|DYLD_[A-Z_]+|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|RUBYOPT|GIT_SSH[A-Z_]*|GIT_EXTERNAL_DIFF|GIT_PAGER|PAGER)=/;

export function hijacksLookup(text: string): boolean {
  return HIJACKING_ASSIGNMENT.test(text);
}

/**
 * Paths whose contents are credentials or private keys. Reading one is not
 * destructive, but it puts secrets in front of the model, so those calls keep
 * going to the classifier even when the command itself is read-only.
 */
export const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)auth\.json$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.pgpass$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)credentials(\.[a-z]+)?$/i,
  /(^|\/)secrets?\.(json|ya?ml|env|toml)$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /(^|\/)\.(ssh|aws|kube|gnupg|docker)(\/|$)/,
  /(^|\/)keychain/i,
  /\.(pem|p12|pfx|key)$/i,
];

export function looksSensitive(text: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(text));
}
