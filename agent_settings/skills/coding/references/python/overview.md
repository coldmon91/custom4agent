# Python

Python 3.11+.
Tooling defaults: uv, ruff, ty, pytest — but an existing project keeps its own tooling (pip, Poetry, mypy, black) unless the user asks to migrate.

## Rules

**Errors**
- Catch the narrowest exception types; never `except Exception: pass` or a bare `except:`
- Re-raise with context: `raise ConfigError(f"load {path}") from exc`
- `assert` is not validation — it vanishes under `python -O`; raise `ValueError` / `TypeError` instead
- Log with `logging` (`logger.exception` inside `except`), not `print`

**Untrusted input**
- `subprocess`: argv list, no `shell=True`, always `timeout=`; put `--` before user-supplied operands
- Every network call has a timeout
- `yaml.safe_load`, never `yaml.load` / `pickle` / `eval` / `exec` on untrusted data
- A user- or remote-supplied name that becomes a path: reject separators and leading dots, or check `resolved.is_relative_to(base)`

**Concurrency**
- Bound parallelism: `ThreadPoolExecutor(max_workers=N)`, or `asyncio.TaskGroup` gated by an `asyncio.Semaphore`
- Every thread or task is joined or awaited before its results are read
- Shared mutable state lives in a lock-owning class; no module-level mutable result containers
- No blocking call (`time.sleep`, `requests`, file I/O) inside `async def`; use `asyncio.to_thread`

**Correctness traps**
- Mutable default arguments (`def f(x=[])`) — use `None` and build inside
- Closures in loops bind late — `functools.partial` or `lambda n=n:`
- No mutation of a dict or list while iterating it — build a new one
- Timezone-aware datetimes: `datetime.now(UTC)`; never compare naive with aware
- Text I/O names `encoding="utf-8"`
- Paths via `pathlib.Path`, not `os.path` string joins

**API shape**
- Type hints on every public function; `X | None` over `Optional[X]`
- Small functions returning values, not mutating globals; named constants for limits, timeouts, exit codes

## Validate before finishing

Run these on every Python change and every Python review; report each command and its result.

- Project with ruff/ty/pytest configured (`pyproject.toml` `[tool.*]` or `[dependency-groups]`):
  - `uv run ruff format --check .`
  - `uv run ruff check .`
  - `uv run ty check <src dir>`
  - `uv run pytest`
- No such configuration (standalone file, pip/Poetry project): run the tools ad hoc without adding config or dependencies:
  - `uvx ruff format --diff <files>`
  - `uvx ruff check --no-cache --select ALL --ignore D,COM812,ISC001,CPY001 --config "lint.per-file-ignores = {'**/tests/**' = ['S101', 'ANN', 'PLR2004', 'INP001'], '**/test_*.py' = ['S101', 'ANN', 'PLR2004', 'INP001']}" <files>`
  - This ignore set is fixed: add no other code on the command line. A rule that is wrong for one specific line gets `# noqa: <code>` there, with the reason in the report
  - `uvx --with <runtime deps> ty check <files>` (e.g. `--with flask==3.0.3` from `requirements.txt`) — an `unresolved-import` that remains for a package you could not supply is environmental; say so rather than "fixing" it
  - tests, if any: `uv run --with pytest pytest`
- Review (read-only): the same checks without `--fix` or a formatting write; fold each real finding into the review with its rule code
- A tool that cannot run (no network, missing interpreter): state which check was skipped and why

## References

| Topic | File | Load when |
|-------|------|-----------|
| Project Setup | `references/project-setup.md` | New project or package: decision tree, tool overview, minimal and full setup |
| pyproject.toml | `references/pyproject.md` | Writing or editing `pyproject.toml` sections, version specifiers, uv.lock |
| uv Commands | `references/uv-commands.md` | uv command lookup, `--with` vs `uv add`, Python version management |
| Ruff | `references/ruff-config.md` | Configuring rule selection, per-file ignores, formatter |
| Testing | `references/testing.md` | pytest fixtures, parametrize, async tests, coverage, hypothesis |
| PEP 723 Scripts | `references/pep723-scripts.md` | Single-file script with dependencies |
| Migration | `references/migration-checklist.md` | User asked to move from pip, setup.py, Poetry, flake8/black/isort, or mypy/pyright |
| Hooks and Security | `references/hooks-and-security.md` | prek pre-commit hooks, secret detection, workflow auditing, pip-audit, Dependabot (`templates/`) |
