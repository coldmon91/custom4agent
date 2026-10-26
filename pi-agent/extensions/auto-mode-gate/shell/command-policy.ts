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

/**
 * Words whose whole segment is a loop header, so nothing runs in it. `case` is
 * not one: its pattern and first command share a segment.
 */
export const HEADER_WORDS: ReadonlySet<string> = new Set(["for", "select"]);

/**
 * `awk`, `find` and friends can act well outside their read-only shape. Rather
 * than interpret their programs, the screener rejects the arguments that do so.
 * `find -exec` and `fd -x` are split off before this check and screened as
 * commands of their own.
 */
export const REJECTED_ARGUMENTS: ReadonlyMap<string, readonly RegExp[]> = new Map([
  // Output redirection or a pipe inside a print statement, shelling out, reading
  // a command's output, a program file this check cannot see, and the environment.
  ["awk", [/\bprintf?\b[^;{}]*[>|]/, /\bsystem\s*\(/, /\|\s*getline/, /\|&/, /^(-f|--file)/, /ENVIRON/]],
  ["find", [/^-(delete|ok|okdir|fprint.*|fls|fprintf)$/]],
  // Any exec flag left after the split is a form the split does not read: `-Hx`, `--exec=`.
  ["fd", [/^--exec/, /^-[a-zA-Z]*[xX]/]],
  // sed writes files without `-i` too: `/re/w out` and the `s///w` flag.
  ["sed", [/\/w\s+\S/, /^s(.).*\1.*\1[a-zA-Z]*w/]],
  ["grep", [/^(--file|-f)$/]],
  ["rg", [/^(--pre|--hostname-bin)$/]],
  ["jq", [/^(--args|--jsonargs)$/]],
]);

/**
 * Environment variables that change which binary a later command actually runs,
 * or inject code into it. A segment that sets one is not screenable: the names
 * in it would no longer mean what this policy assumes. `IFS` is not one: it
 * only splits expanded values, which the screener already treats as unknown.
 */
const HIJACKING_ASSIGNMENT =
  /^(PATH|ENV|BASH_ENV|SHELL|LD_[A-Z_]+|DYLD_[A-Z_]+|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|RUBYOPT|GIT_SSH[A-Z_]*|GIT_EXTERNAL_DIFF|GIT_PAGER|PAGER)=/;

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
