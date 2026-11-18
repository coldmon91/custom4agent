# Testing with pytest

Strict pytest configuration with coverage enforcement.
Tests live in `tests/` beside `src/`; shared fixtures go in `tests/conftest.py`.

## Setup

```bash
uv add --group test pytest pytest-cov
uv add --group test pytest-asyncio   # async def tests (@pytest.mark.asyncio)
uv add --group test hypothesis       # property-based tests
```

## pyproject.toml

```toml
[tool.pytest]
testpaths = ["tests"]
pythonpath = ["src"]
addopts = [
    "-ra",                       # summary of every non-passing outcome
    "--strict-markers",          # unknown marker is an error
    "--strict-config",           # config typo is an error
    "--cov=myproject",
    "--cov-report=term-missing",
]
markers = [
    "slow: marks tests as slow",
    "integration: marks integration tests",
]
filterwarnings = [
    "error",                     # warnings fail the test
    "ignore::DeprecationWarning:third_party.*",
]

[tool.coverage.run]
branch = true
source = ["src/myproject"]
omit = ["*/__main__.py", "*/conftest.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
    "@abstractmethod",
]
fail_under = 80
show_missing = true
```

With `--strict-markers`, every custom marker must be listed under `markers`.
Skip coverage for a quick loop: `uv run pytest -x -q --no-cov`.

## CI

```yaml
- name: Run tests
  run: |
    uv sync --group test
    uv run pytest --cov-report=xml
```

Upload `coverage.xml` with `codecov/codecov-action` pinned to a SHA if the project reports coverage.
