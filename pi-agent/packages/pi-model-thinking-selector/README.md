# pi-model-thinking-selector

A [pi](https://pi.dev) extension that replaces model switching with a single searchable
picker: fuzzy filter, pinned favorites, recently used models, and per-model reasoning
effort — all chosen in one overlay and remembered across sessions.

## Why

pi's built-in picker only writes your startup model to `settings.json` when it is invoked
with `persist`, and the extension API's `setModel()` is always session-scoped. This
extension mirrors your choice into global settings, so the model and effort you picked are
still there the next time you start pi.

## Install

```bash
pi install npm:pi-model-thinking-selector
```

Project-local install (writes to `.pi/settings.json`, shareable with your team):

```bash
pi install -l npm:pi-model-thinking-selector
```

Try it for one run without installing:

```bash
pi -e npm:pi-model-thinking-selector
```

## Usage

| Key | Action |
| --- | --- |
| `alt+p` | Open the model and effort picker |
| `ctrl+shift+t` | Cycle to the next effort level supported by the current model |

Inside the picker:

| Key | Action |
| --- | --- |
| any character | Filter models (space-separated tokens, all must match) |
| `Backspace` | Delete one filter character |
| `↑` / `↓` | Move through the list |
| `←` / `→` | Step the reasoning effort of the highlighted model |
| `Space` | Pin or unpin the highlighted model as a favorite |
| `Enter` | Apply the model and effort |
| `Esc` | Clear the filter, or cancel when it is already empty |

The list is grouped as **Favorite models**, **Recent models**, then **All models**. Only
models with configured auth are listed. `●` marks the active model, `★` marks a favorite.

Effort is clamped to what the highlighted model actually supports, so the picker shows both
the requested level and the effective one (`high → medium`) when they differ. Models without
reasoning show `effort unavailable`.

## Configuration

Optional. Create `~/.pi/agent/model-thinking-selector.json`:

```json
{
  "persistDefaultModel": true,
  "persistThinkingLevel": true,
  "selectorShortcut": "alt+p",
  "cycleThinkingShortcut": "ctrl+shift+t",
  "maxFavoriteModels": 5,
  "maxRecentModels": 5,
  "maxVisibleModels": 10
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `persistDefaultModel` | `true` | Write the picked model to `settings.json` as the startup default |
| `persistThinkingLevel` | `true` | Write the picked effort to `settings.json` under `modelThinkingLevels` |
| `selectorShortcut` | `"alt+p"` | Key that opens the picker |
| `cycleThinkingShortcut` | `"ctrl+shift+t"` | Key that cycles effort |
| `maxFavoriteModels` | `5` | Favorite slots (1 ~ 20) |
| `maxRecentModels` | `5` | Recent slots (1 ~ 20) |
| `maxVisibleModels` | `10` | Rows shown at once (1 ~ 50) |

The file is read once at startup. A missing or malformed file falls back to the defaults.
Unknown keys are ignored.

Set both `persist*` fields to `false` to keep every change session-scoped — the picker,
favorites, and recents still work, but your global `settings.json` is never touched.

## Files written

Under the pi agent directory (`~/.pi/agent`):

- `favorite-models.json` — pinned models, most recently pinned first
- `recent-models.json` — recently selected models, most recent first
- `settings.json` — only `defaultProvider`, `defaultModel`, and `modelThinkingLevels`, and
  only while the matching `persist*` option is enabled

All writes go through a temp file and an atomic rename, and are serialized within the
process so concurrent updates cannot truncate a store.

## Requirements

- pi `>= 0.84`
- Node `>= 22`

## License

MIT
