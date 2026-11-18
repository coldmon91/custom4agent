# Migration Checklist

Comprehensive checklist for migrating Python projects to modern tooling.
Migrate only when the user asks; otherwise keep the project's existing tooling.

## Per-Tool Steps

### From requirements.txt + pip

**Standalone scripts**: convert to PEP 723 inline metadata (see [pep723-scripts.md](./pep723-scripts.md)).

**Projects**:
```bash
# Initialize uv in existing project
uv init --bare

# Add dependencies using uv (not by editing pyproject.toml)
uv add requests rich  # add each package

# Or import from requirements.txt (review each package before adding)
# Note: Complex version specifiers may need manual handling
grep -v '^#' requirements.txt | grep -v '^-' | grep -v '^\s*$' | while read -r pkg; do
    uv add "$pkg" || echo "Failed to add: $pkg"
done

uv sync
```

Then:
1. Delete `requirements.txt`, `requirements-dev.txt`
2. Delete virtual environment (`venv/`, `.venv/`)
3. Add `uv.lock` to version control

### From setup.py / setup.cfg

1. Run `uv init --bare` to create pyproject.toml
2. Use `uv add` to add each dependency from `install_requires`
3. Use `uv add --group dev` for dev dependencies
4. Copy non-dependency metadata (name, version, description, etc.) to `[project]`
5. Delete `setup.py`, `setup.cfg`, `MANIFEST.in`

### From flake8 + black + isort

1. Remove flake8, black, isort via `uv remove`
2. Delete `.flake8`, `pyproject.toml [tool.black]`, `[tool.isort]` configs
3. Add ruff: `uv add --group dev ruff`
4. Add ruff configuration (see [ruff-config.md](./ruff-config.md))
5. Run `uv run ruff check --fix .` to apply fixes
6. Run `uv run ruff format .` to format

### From mypy / pyright

1. Remove mypy/pyright via `uv remove`
2. Delete `mypy.ini`, `pyrightconfig.json`, or `[tool.mypy]`/`[tool.pyright]` sections
3. Add ty: `uv add --group dev ty`
4. Run `uv run ty check src/`

## Before Migration

- [ ] **Determine layout**: `src/` or flat? Configure `[tool.uv.build-backend]` if flat
- [ ] **Decide uv.lock strategy**: app (commit) vs library (.gitignore)
- [ ] **Backup current state**: Create a branch or tag before starting

## Cleanup Old Artifacts

Find and remove legacy linter comments:

```bash
# Find files with old linter pragmas
rg "# pylint:|# noqa:|# type: ignore" --files-with-matches

# Find missing __init__.py files
uv run ruff check --select=INP001 .
```

Remove these files after migration:
- [ ] `requirements.txt`, `requirements-dev.txt`
- [ ] `setup.py`, `setup.cfg`, `MANIFEST.in`
- [ ] `.flake8`, `mypy.ini`, `pyrightconfig.json`
- [ ] `tox.ini` (if not needed)
- [ ] `Pipfile`, `Pipfile.lock`
- [ ] Old virtual environments (`venv/`, `.venv/`)

## .gitignore Updates

Add these entries:

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/

# Tools
.ruff_cache/
.ty/

# uv (for libraries only - apps should commit uv.lock)
# uv.lock
```

## pyproject.toml Sections to Remove

- [ ] `[tool.black]`
- [ ] `[tool.isort]`
- [ ] `[tool.mypy]`
- [ ] `[tool.pyright]`
- [ ] `[tool.pylint]`
- [ ] `[tool.flake8]` (if present)

## Post-Migration Easy Wins

Run these to modernize code automatically:

```bash
# Pyupgrade modernization (typing, syntax)
uv run ruff check --select=UP --fix .

# Unnecessary variable assignments before return
uv run ruff check --select=RET504 --fix .

# Simplifications (conditionals, comprehensions)
uv run ruff check --select=SIM --fix .

# Remove commented-out code
uv run ruff check --select=ERA --fix .
```

## CI Cleanup

- [ ] Remove scheduled CI triggers (activity without progress is theater)
- [ ] Update CI to use `uv sync` and `uv run`
- [ ] Pin GitHub Actions to SHA hashes
- [ ] Set up security tooling (see [hooks-and-security.md](./hooks-and-security.md))

## Gradual ty Adoption

For legacy codebases with many type errors, start lenient:

```toml
[tool.ty.terminal]
error-on-warning = true

[tool.ty.environment]
python-version = "3.11"

[tool.ty.rules]
# Start with these ignored for legacy codebases
possibly-missing-attribute = "ignore"
unresolved-import = "ignore"
invalid-argument-type = "ignore"
not-subscriptable = "ignore"
unresolved-attribute = "ignore"
```

Remove rules as you fix errors. Track progress:

```bash
# Count remaining issues
uv run ty check src/ 2>&1 | grep -c "error"
```

## Supply Chain Security

- [ ] Add pip-audit to dependency groups
- [ ] Configure Dependabot with 7-day cooldown
- [ ] Pin exact versions in production (`==` not `>=`)

See [hooks-and-security.md](./hooks-and-security.md) for pip-audit and Dependabot configuration.

## Verification

After migration, verify everything works:

```bash
# Install all dependencies
uv sync --all-groups

# Run linting
uv run ruff check .
uv run ruff format --check .

# Run type checking
uv run ty check src/

# Run tests
uv run pytest

# Security audit
uv run pip-audit

# Build package (if distributable)
uv build
```
