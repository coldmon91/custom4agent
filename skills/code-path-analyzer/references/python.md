# Python Checklist

Check for:
- decorators such as Flask / FastAPI / Click / Typer / Celery registrations
- `if __name__ == "__main__":`
- dynamic imports and registry patterns
- signal connections
- monkey patching and string-based dispatch
- Django URLs, management commands, signals, middleware

Useful search patterns:
- `@app.`, `@router.`, `@bp.`, `@click.command`, `@shared_task`
- `__main__`
- `dispatch`, `register`, `signal`, `receiver`

## Async and Concurrency Patterns

Check for:
- `asyncio.create_task()`, `gather()`, `run_until_complete()`
- `asyncio.Queue`, `multiprocessing.Queue`
- `asyncio.sleep()`, `loop.call_later()`

Async-specific guidance:
- Trace where tasks are created and which event loop drives them.
- Trace where queue data enters and what keeps consumer loops running.
- Mark confidence as reduced if callback or task chains are long or conditional.
- Mark scheduled paths with execution time windows.

## Error Control Flow

Check for:
- `try` / `except` / `finally` branches
- whether exceptions escape to callers or are handled locally

Error-specific guidance:
- `finally` blocks still run before `return` or re-raise paths complete.
- Treat exception-only paths as reachable only when the triggering error source is explained.

## Dynamic Loading and Generated Code

Check for:
- `importlib.import_module()`, `__import__()`, `exec()`, lazy loading
- `locals()[name]()`, `getattr(obj, name)()`, registry dictionaries
- Django ORM `.filter()`, SQLAlchemy dynamic column or model access
- duck typing and descriptor protocol

Dynamic-specific guidance:
- Mark paths as low-confidence if the target is loaded by string name or environment-dependent logic.
- Trace where string keys originate, such as user input, config, or database values.
- Identify all possible targets if an implementation registry exists in project code.

## Conditional Compilation and Feature Flags

Check for:
- environment variables such as `FEATURE_XYZ=1`
- framework version assumptions in `requirements.txt`, `pyproject.toml`, or lock files

Feature-flag guidance:
- Trace whether the flag source is external environment or internal code configuration.
- If the flag can change in a running system, mark timing as uncertain.
- Mark explicitly when analysis depends on framework version assumptions such as Django or FastAPI behavior.

## Unused Code Detection (Python)

### Required tool

```bash
# Install
pip install vulture

# Verify
vulture --version
```

`vulture` is an AST-based static analysis tool — the most reliable dead-code detector for Python.

### Running the tool

```bash
# Basic run (report symbols with >= 60% confidence)
vulture . --min-confidence 60

# Stricter (only high-confidence results)
vulture . --min-confidence 80

# With a whitelist file to suppress false positives
vulture . whitelist.py --min-confidence 60

# Exclude specific directories
vulture . --exclude vendor,build,dist,__pycache__,.venv

# Sort by symbol size (larger = more impactful to remove)
vulture . --min-confidence 60 --sort-by-size
```

Output format:

```
path/to/file.py:42: unused function 'old_helper' (60% confidence)
path/to/file.py:88: unused variable 'DEBUG_FLAG' (100% confidence)
path/to/file.py:120: unused class 'LegacyParser' (80% confidence)
```

Confidence levels:
- **100%** — no references found anywhere → UNUSED candidate
- **60–90%** — possible dead code, edge case check required before classifying

### Entry points

```bash
# Script entry points
grep -rn "if __name__ == ['\"]__main__['\"]" --include="*.py" .

# Package exports (__all__)
grep -rn "__all__" --include="*.py" .

# setup.py / pyproject.toml console scripts
grep -rn "entry_points\|console_scripts" setup.py pyproject.toml 2>/dev/null

# pytest fixtures
grep -rn "@pytest.fixture\|@pytest.mark" --include="*.py" .

# Web framework routes
grep -rn "@app.route\|@router\.\|urlpatterns" --include="*.py" .

# Celery tasks
grep -rn "@app.task\|@celery.task\|@shared_task" --include="*.py" .
```

### Writing a whitelist file

```python
# whitelist.py example

# Django model methods (called by ORM)
_.save
_.delete
_.clean
_.get_absolute_url

# Flask view methods
_.dispatch_request

# pytest lifecycle hooks
_.setup
_.teardown

# Python magic methods (always whitelist these)
_.__init__
_.__str__
_.__repr__
_.__enter__
_.__exit__
_.__len__
_.__iter__
_.__next__
_.__getitem__
_.__setitem__
```

Run as: `vulture . whitelist.py`

### Edge cases → classify as UNKNOWN

**1. Dynamic attribute access via `getattr` / `hasattr`**
```bash
grep -rn "getattr\|hasattr" --include="*.py" .
```
If `getattr(obj, method_name)` patterns exist → all methods in that module/class are UNKNOWN.

**2. `__all__` exports**
```bash
grep -rn "__all__" --include="*.py" .
```
Symbols listed in `__all__` may be imported externally → UNKNOWN.

**3. Framework magic invocation**
```bash
# Django signals
grep -rn "post_save\|pre_delete\|Signal\|receiver" --include="*.py" .

# SQLAlchemy events
grep -rn "@event.listens_for" --include="*.py" .

# Celery tasks
grep -rn "@app.task\|@shared_task" --include="*.py" .
```
Handler functions in files using these patterns → UNKNOWN.

**4. Dynamic imports via `importlib`**
```bash
grep -rn "importlib\|__import__\|import_module" --include="*.py" .
```
Dynamically loaded modules → symbols in those packages are UNKNOWN.

**5. Namespace introspection: `vars()` / `locals()` / `globals()`**
```bash
grep -rn "vars()\|locals()\|globals()" --include="*.py" .
```
Dict-based namespace access → variables in the same scope are UNKNOWN.

**6. `exec()` / `eval()` usage**
```bash
grep -rn "\bexec\b\|\beval\b" --include="*.py" .
```
Dynamic code execution → all symbols in the same module are UNKNOWN.

**7. Metaclasses / `__init_subclass__`**
```bash
grep -rn "metaclass\|__init_subclass__\|type(" --include="*.py" .
```
Dynamically generated class attributes → UNKNOWN.

**8. `TYPE_CHECKING` imports**
```bash
grep -rn "TYPE_CHECKING\|from __future__ import annotations" --include="*.py" .
```
Symbols imported inside `if TYPE_CHECKING:` blocks are type-hint-only and do not run at runtime. Treat them as "used" — do not report as UNUSED.

### Exclusion patterns

```bash
vulture . \
  --exclude ".venv,venv,env,build,dist,__pycache__,*.egg-info,migrations"
```

Always exclude Django `migrations/` — it is auto-generated.

### Supplementary tools

```bash
# Unused imports (flake8)
pip install flake8
flake8 . --select=F401

# More precise import analysis
pip install autoflake
autoflake --check --remove-all-unused-imports -r .
```
