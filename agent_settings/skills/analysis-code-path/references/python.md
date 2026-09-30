# Python

## Entry points and registration
- `if __name__ == "__main__":`, `console_scripts` / `entry_points` in `pyproject.toml` or `setup.py`
- Routes: `@app.`, `@router.`, `@bp.`, `include_router`, `add_api_route`, Django `urlpatterns`, `path(`, `re_path(`
- CLI: `@click.command`, `@click.group`, Typer, Django management commands
- Tasks and signals: `@shared_task`, `@celery.task`, `@receiver`, `post_save`, `@event.listens_for`
- Middleware, `Depends(`, pytest `@pytest.fixture`

## Path-specific patterns
- Async: `asyncio.create_task`, `gather`, `asyncio.Queue`, `multiprocessing.Queue`, `loop.call_later`. Trace which event loop runs the task and what feeds the queue.
- Dynamic: `importlib.import_module`, `__import__`, `getattr(obj, name)()`, `locals()[name]()`, registry dicts, monkey patching. Trace where the name string comes from.
- ORM: Django `.filter()`, SQLAlchemy dynamic column or model access.
- Flags: env vars such as `FEATURE_XYZ=1`. Framework versions live in `pyproject.toml`, `requirements.txt`, or lock files.

## Unused code: vulture

```bash
pip install vulture
vulture <scope> --min-confidence 60 \
  --exclude ".venv,venv,env,build,dist,__pycache__,*.egg-info,migrations"
vulture <scope> --make-whitelist > whitelist.py   # prune, then: vulture <scope> whitelist.py
```

- Output line: `path/file.py:42: unused function 'old_helper' (60% confidence)`
- 100% is an `UNUSED` candidate; 60 ~ 90% needs the rejection rules first.
- Always exclude Django `migrations/` (auto-generated).
- Unused imports only: `flake8 --select=F401`.

### Edge cases: `UNKNOWN`
- `getattr` / `hasattr` with a variable name: all methods of that class or module
- Listed in `__all__`
- Handlers in files using Django signals, SQLAlchemy events, or Celery tasks
- Modules loaded through `importlib` / `__import__`
- Same scope uses `vars()` / `locals()` / `globals()`
- Same module uses `exec` / `eval`
- Classes with a metaclass or `__init_subclass__`

Imports inside `if TYPE_CHECKING:` are type-hint only: treat them as used, not `UNUSED`.

```bash
rg -n 'getattr|hasattr|__all__|importlib|__import__|vars\(\)|locals\(\)|globals\(\)|\bexec\(|\beval\(|metaclass|__init_subclass__|TYPE_CHECKING' -g '*.py' <scope>
```
