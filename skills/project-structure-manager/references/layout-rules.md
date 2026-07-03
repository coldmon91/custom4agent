# Layout Rules

Use this reference when deciding where new code belongs or when auditing an existing repository layout.

## Placement Order

1. Reuse an established feature or domain directory before creating a new top-level directory.
2. Place code next to the module it extends when the change is local in scope.
3. Split by responsibility first, then by technical layer only when the repository already follows that pattern.
4. Keep entrypoints thin. Move reusable logic into modules that can be imported and tested.
5. Keep tests near the test convention already used by the repository:
- `tests/` for centralized test suites
- `src/.../tests` or `__tests__/` for colocated tests

## Directory Heuristics

- `src/`, `lib/`, `app/`: primary application or library code
- `cmd/`, `bin/`, `scripts/`: executables, developer utilities, automation
- `tests/`, `spec/`, `__tests__/`: automated tests
- `docs/`: user-facing or internal documentation
- `config/`, `configs/`: checked-in configuration templates
- `examples/`: sample integrations or usage demos
- `assets/`, `static/`, `public/`: non-code runtime assets

## New Directory Checklist

Create a new directory only when one of these is true:

- The code introduces a new domain area with multiple files.
- The repository already separates this concern elsewhere.
- Mixing the files into an existing directory would make discovery worse.

Avoid a new top-level directory when a nested directory under an existing module is enough.

## File Split Rules

- Keep one file focused on one responsibility.
- Extract shared utilities only after two or more real call sites exist.
- Avoid `utils`, `helpers`, or `common` as a first choice when a domain-specific name is available.
- Group interface definitions, data models, and transport adapters according to the repository's existing pattern.

## Source and Test Pairing

- Put tests where maintainers will expect them based on current repo structure.
- Mirror the source path in test paths when the repository uses centralized tests.
- Name fixtures and sample data so their owning feature is obvious from the path.

## Refactor Guidance

When moving files:

1. Update imports and module references in the same change.
2. Check build scripts, CI config, and packaging manifests.
3. Refresh any generated project map after the move.
