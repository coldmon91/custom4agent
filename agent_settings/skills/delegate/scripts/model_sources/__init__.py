"""Per-CLI model listings. Each module exposes the same small interface:

- NAME, DEFAULT_TIMEOUT, SOURCE_DESCRIPTION
- add_arguments(parser): CLI-specific options
- list_models(options) -> list[dict]: rows with at least `model` and `efforts`
- table_columns(rows) -> list[(header, cell_fn)]
"""

from . import claude, codex, pi

SOURCES = {module.NAME: module for module in (codex, pi, claude)}
