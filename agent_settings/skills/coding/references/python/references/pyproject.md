# pyproject.toml

Project metadata, build backend, dependencies, and uv settings.
Tool sections live with their tools: [ruff-config.md](ruff-config.md), [testing.md](testing.md); the starter file is in [project-setup.md](project-setup.md).

Change `dependencies` and `[dependency-groups]` through `uv add` / `uv remove`, never by hand.

## [project]

```toml
[project]
name = "myproject"
version = "0.1.0"
description = "A modern Python project"
readme = "README.md"
license = "MIT"                 # SPDX identifier
requires-python = ">=3.11"
dependencies = ["requests", "rich"]

[project.scripts]
myproject = "myproject.cli:main"

[project.urls]
Repository = "https://github.com/org/myproject"
```

Use a static `version`, not VCS-derived dynamic versioning.

## [build-system]

```toml
[build-system]
requires = ["uv_build>=0.9,<1"]  # latest 0.x: https://pypi.org/project/uv-build/
build-backend = "uv_build"
```

`uv_build` over hatchling or setuptools: simpler and sufficient for most packages.
Flat layout (no `src/`):

```toml
[tool.uv.build-backend]
module-root = ""
```

## Dependency groups vs optional dependencies

- `[dependency-groups]` (PEP 735): dev tools — lint, test, audit, docs. Never installed by users.
- `[project.optional-dependencies]`: optional *runtime* features users opt into (`mylib[postgres]`). Rarely needed; never for dev tools.

```toml
[dependency-groups]
dev = [{include-group = "lint"}, {include-group = "test"}, {include-group = "audit"}]
lint = ["ruff", "ty"]
test = ["pytest", "pytest-cov"]
audit = ["pip-audit"]
docs = ["sphinx", "myst-parser"]
```

## [tool.uv]

```toml
[tool.uv]
default-groups = ["dev", "test"]   # installed by plain `uv sync`
python-preference = "managed"
```

## uv.lock

- Application: commit it — reproducible deploys
- Library: `.gitignore` it — users resolve their own dependencies
