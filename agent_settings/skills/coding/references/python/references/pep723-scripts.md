# PEP 723: Inline Script Metadata

Dependencies declared inside a single-file script, so it needs no `requirements.txt` or `pyproject.toml`.

**Use for** a single-file script with external dependencies.
**Use `pyproject.toml` instead** for multi-file code, reusable packages, or anything needing dependency groups, editable or local dependencies, or a lockfile.

## Syntax

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx",
#     "rich",
# ]
# ///

import httpx
from rich import print

print(httpx.get("https://example.com", timeout=10).status_code)
```

Run with `uv run script.py`, or `./script.py` after `chmod +x`.

Shebang variants: `uv run --python 3.12 --script` pins the interpreter; `uv run --quiet --script` suppresses uv output.

## Managing dependencies

```bash
uv init --script script.py            # create with an empty metadata block
uv add --script script.py requests    # add
uv remove --script script.py requests # remove
```

Let `uv add --script` choose versions; do not hand-write version constraints.
Always keep `requires-python`, as a lower bound (`>=3.11`), not an exact pin.

## Private index

```python
# /// script
# dependencies = ["httpx"]
#
# [tool.uv]
# extra-index-url = ["https://pypi.company.com/simple/"]
# ///
```

## Limitations

No dependency groups, no editable or local dependencies, no lockfile — versions can differ between runs.
