# Hooks and Security

Pre-commit hooks with prek, workflow auditing, and dependency scanning.
Hook configuration lives in one place: copy [templates/pre-commit-config.yaml](../templates/pre-commit-config.yaml) to `.pre-commit-config.yaml` and replace every `<latest>` with the current release from the linked page.

## Tools

| Tool | Runs | Catches |
|------|------|---------|
| **ruff** | pre-commit | Lint and format (see [ruff-config.md](ruff-config.md)) |
| **shellcheck** | pre-commit | Shell script bugs, quoting issues |
| **detect-secrets** | pre-commit | Leaked API keys, passwords, tokens |
| **actionlint** | pre-commit, CI | Workflow syntax errors, invalid refs |
| **zizmor** | pre-commit, CI | Workflow security issues, excessive permissions |
| **pip-audit** | CI, manual | Known CVEs in dependencies |
| **Dependabot** | scheduled | Outdated dependencies |

## prek

[prek](https://github.com/j178/prek) is a Rust-native drop-in for pre-commit: same `.pre-commit-config.yaml`, no Python runtime, uses uv for Python hooks.

Install: `brew install prek` or `uv tool install prek`.
Hook tools install themselves when prek runs them.

```bash
prek install                            # install git hooks
prek run --all-files                    # what CI should run
prek run ruff                           # one hook
prek auto-update --cooldown-days 7      # bump revs, skip releases younger than 7 days
```

- `repo: builtin` hooks (trailing-whitespace, end-of-file-fixer, check-yaml, check-toml, check-json, check-merge-conflict) are Rust-native and work offline
- Pin `rev` to a release, never a branch
- From pre-commit: `uv tool uninstall pre-commit`, then `prek install`; the config works unchanged
- CI: `j178/prek-action` pinned to a SHA, or `uv tool install prek && prek run --all-files`

## detect-secrets

Create the baseline before the first commit, or the hook fails on every existing false positive:

```bash
detect-secrets scan > .secrets.baseline
detect-secrets audit --report .secrets.baseline   # confirm no real secret is in it
git add .secrets.baseline
```

When the hook fails:
- False positive: `detect-secrets scan --update .secrets.baseline`
- Real secret: remove it from the code and rotate the credential

## Workflow auditing (actionlint, zizmor)

```bash
actionlint .github/workflows/
zizmor .github/workflows/
```

zizmor `excessive-permissions` means the workflow has no `permissions:` block and gets write access to everything.
Declare the minimum:

```yaml
permissions:
  contents: read          # lint, test, audit
# contents: write         # push or release
# pull-requests: write    # comment on PRs
```

Other common zizmor findings: `template-injection` (`${{ github.event.* }}` inside `run:`), `unpinned-action` (pin to SHA), `dangerous-triggers` (`pull_request_target` with checkout).

## pip-audit

Add with `uv add --group audit pip-audit`, run in CI as `uv run pip-audit .`.

When it reports a vulnerability:
1. Check whether the vulnerable code path is reachable from this project
2. Upgrade: `uv lock --upgrade-package <pkg> && uv sync`
3. No fixed release: weigh the risk, find an alternative, or ignore that advisory with a recorded reason

## Dependabot

Copy [templates/dependabot.yml](../templates/dependabot.yml) to `.github/dependabot.yml`: weekly pip and GitHub Actions updates, grouped minor/patch PRs.

`cooldown.default-days: 7` delays versions published less than 7 days ago, giving the community time to detect and yank a compromised release.
pip-audit and Dependabot complement each other: pip-audit flags a vulnerable version installed now, Dependabot keeps versions from drifting.
Other options: [configuration reference](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file).
