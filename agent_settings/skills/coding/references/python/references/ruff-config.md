# Ruff Configuration

ruff lints and formats; it does not type-check (that is ty).
Starter `[tool.ruff]` block: [project-setup.md](project-setup.md).
This file covers what to add on top of it.

## Ignores

Keep `select = ["ALL"]` and ignore explicitly.

Always ignore — they conflict with the formatter:

```toml
ignore = [
    "D",        # docstrings (enable selectively, see below)
    "COM812",   # missing-trailing-comma
    "ISC001",   # single-line-implicit-string-concatenation
]
```

Commonly added:

```toml
    "ANN401",   # Any in signatures
    "TD002",    # TODO without author
    "TD003",    # TODO without issue link
    "FIX002",   # line contains TODO
```

## Per-file ignores

```toml
[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S101", "PLR2004", "ANN", "D"]   # assert, magic values, annotations, docstrings
"scripts/**/*.py" = ["T20", "INP001"]               # print, no __init__.py
"__init__.py" = ["F401"]                            # re-exports
"**/migrations/*.py" = ["ALL"]                      # generated code
```

## Imports

```toml
[tool.ruff.lint.isort]
known-first-party = ["myproject"]
required-imports = ["from __future__ import annotations"]
```

## Docstrings

To enable `D`, remove `"D"` from the base `ignore` list, pick one convention, and drop the mutually exclusive pairs:

```toml
[tool.ruff.lint]
ignore = [
    "D100",     # module docstring
    "D104",     # package docstring
    "D203",     # conflicts with D211
    "D213",     # conflicts with D212
]

[tool.ruff.lint.pydocstyle]
convention = "google"  # or "numpy", "pep257"
```

## Formatter

```toml
[tool.ruff.format]
quote-style = "double"
docstring-code-format = true
docstring-code-line-length = 80
```

## Modernizing and migrating

- `uv run ruff check --select UP --fix .` rewrites old syntax for `target-version` (`Optional[X]` → `X | None`, `List[X]` → `list[X]`, bare `super()`)
- Moving from a 120-column codebase: keep `line-length = 120` at first and tighten later, to avoid a mass reflow
- Removing flake8 / black / isort: [migration-checklist.md](migration-checklist.md)

## CI

```yaml
- run: uv run ruff check --output-format=github .
- run: uv run ruff format --check .
```
