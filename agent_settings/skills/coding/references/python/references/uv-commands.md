# uv Commands

uv manages the virtualenv itself: never create or activate one by hand; run everything through `uv run`.
Full flag lists: `uv <command> --help`.

## Core

| Command | Use |
|---------|-----|
| `uv init` / `uv init --package` / `uv init --lib` | New app / distributable package (`src/` layout) / library |
| `uv add <pkg>` / `uv add --group dev <pkg>` | Runtime / group dependency |
| `uv remove <pkg>` | Drop a dependency |
| `uv lock --upgrade-package <pkg>` | Upgrade one dependency (then `uv sync`) |
| `uv sync` / `uv sync --all-groups` | Install default groups / every group |
| `uv sync --frozen` | Install exactly from `uv.lock` — use in CI |
| `uv run <cmd>` | Run inside the project environment |
| `uv build` / `uv publish` | Build wheel+sdist / upload to PyPI |
| `uvx <tool>` | Run a tool without installing it (`uv tool run`) |
| `uv python pin 3.12` | Pin the project interpreter (`.python-version`) |
| `uv run --python 3.11 pytest` | One-off run on another interpreter |

## `--with` vs `uv add`

- `uv add`: the package is a project dependency (goes in pyproject.toml/uv.lock)
- `--with`: one-off usage, testing, or scripts outside a project context

```bash
uv run --with requests --with rich python script.py   # no project needed
uv run --with httpx pytest                            # project deps + httpx
uvx --with flask ty check app/                        # type-check against deps not installed locally
```

## Host and container on one checkout

Separate virtualenvs avoid rebuilding on every switch (different OS, interpreter, or native wheels):

```bash
export UV_PROJECT_ENVIRONMENT=.venv-dev   # host shell profile or .envrc
uv sync                                    # host uses .venv-dev, containers keep .venv
```

Add both `.venv/` and `.venv-dev/` to `.gitignore`.

## Environment variables

| Variable | Effect |
|----------|--------|
| `UV_PROJECT_ENVIRONMENT` | Virtualenv directory |
| `UV_CACHE_DIR` / `UV_NO_CACHE` | Cache location / disable cache |
| `UV_PYTHON` | Default interpreter |
| `UV_SYSTEM_PYTHON` | Use the system interpreter |
