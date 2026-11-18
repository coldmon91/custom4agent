# Project Setup

New Python projects with uv, ruff, ty, and pytest, based on [trailofbits/cookiecutter-python](https://github.com/trailofbits/cookiecutter-python).
Targets Python 3.11+.

## Decision Tree

```
What are you doing?
│
├─ Single-file script with dependencies?
│   └─ PEP 723 inline metadata (pep723-scripts.md)
│
├─ New multi-file project (not distributed)?
│   └─ Minimal Project below
│
├─ New reusable package/library?
│   └─ Full Project below
│
└─ Migrating an existing project (only when the user asks)?
    └─ migration-checklist.md
```

## Tool Overview

| Tool | Purpose | Replaces |
|------|---------|----------|
| **uv** | Package/dependency management | pip, virtualenv, pip-tools, pipx, pyenv |
| **ruff** | Linting AND formatting | flake8, black, isort, pyupgrade, pydocstyle |
| **ty** | Type checking | mypy, pyright |
| **pytest** | Testing with coverage | unittest |
| **prek** | Pre-commit hooks | pre-commit |

Hooks, secret detection, workflow auditing, and dependency scanning: [hooks-and-security.md](hooks-and-security.md).

## Minimal Project

For multi-file projects not intended for distribution:

```bash
uv init myproject
cd myproject
uv add requests rich
uv add --group dev pytest ruff ty
uv run python src/myproject/main.py
uv run pytest
uv run ruff check .
```

## Full Project

Ask the user whether to bootstrap with the Trail of Bits cookiecutter template, which ships preconfigured tooling:

```bash
uvx cookiecutter gh:trailofbits/cookiecutter-python
```

Otherwise:

### 1. Create the structure

```bash
uv init --package myproject
cd myproject
```

```
myproject/
├── pyproject.toml
├── README.md
├── src/
│   └── myproject/
│       └── __init__.py
└── .python-version
```

### 2. Configure pyproject.toml

Complete reference: [pyproject.md](pyproject.md).
Key sections:

```toml
[project]
name = "myproject"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = []

[dependency-groups]
dev = [{include-group = "lint"}, {include-group = "test"}, {include-group = "audit"}]
lint = ["ruff", "ty"]
test = ["pytest", "pytest-cov"]
audit = ["pip-audit"]

[tool.ruff]
line-length = 100
target-version = "py311"
src = ["src"]

[tool.ruff.lint]
select = ["ALL"]
ignore = ["D", "COM812", "ISC001"]

[tool.pytest]
addopts = ["--cov=myproject", "--cov-fail-under=80"]

[tool.ty.terminal]
error-on-warning = true

[tool.ty.environment]
python-version = "3.11"

[tool.ty.rules]
# Strict from day 1 for new projects
possibly-unresolved-reference = "error"
unused-ignore-comment = "warn"
```

### 3. Install dependencies

```bash
uv sync --all-groups   # every group
uv sync --group dev    # one group
```

### 4. Add a Makefile

```makefile
.PHONY: dev lint format test build

dev:
	uv sync --all-groups

lint:
	uv run ruff format --check && uv run ruff check && uv run ty check src/

format:
	uv run ruff format .

test:
	uv run pytest

build:
	uv build
```

## Checklist

- [ ] `src/` layout for packages
- [ ] `requires-python = ">=3.11"`
- [ ] ruff with `select = ["ALL"]` and explicit ignores
- [ ] ty for type checking
- [ ] Test coverage minimum (80%+)
- [ ] Dependency groups, not extras, for dev tools
- [ ] `uv.lock` in version control (applications)
- [ ] PEP 723 for standalone scripts
