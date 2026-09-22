# Unavailable Favorite Models Design

## Goal

Keep unavailable favorite models visible in the model selector so users can identify and remove them explicitly.
Unavailable favorites continue to occupy a favorite slot until removed.

## Scope

Apply the behavior consistently to:

- `pi-agent/extensions/model-thinking-selector.ts`, the active local extension
- `pi-agent/packages/pi-model-thinking-selector`, the distributable package

Do not expose every unavailable catalog model in the general model list.

## Model states

The selector distinguishes three states:

1. **Available**: present in the model registry with configured authentication.
2. **Unavailable with metadata**: present in the registry without configured authentication.
3. **Unavailable placeholder**: no longer present in the registry, but retained in `favorite-models.json`.

The model data layer keeps the full registry catalog separately from the available model list.
Favorite rows resolve against both collections and fall back to the persisted provider/model ID when metadata no longer exists.

## User experience

Unavailable models appear in their persisted order inside **Favorite models**.
Their row includes an `unavailable` warning label and warning or muted styling.

For an unavailable row:

- `Space` removes it from favorites and persists the updated store.
- `Enter` leaves the selector open and displays an explanatory warning.
- Left/right effort changes do nothing.
- Search matches the persisted provider/model ID and any metadata still available.

Available rows retain current behavior.

## Data and compatibility

`favorite-models.json` keeps its existing schema.
No migration is required.
Unavailable entries remain stored and count toward `maxFavoriteModels` until the user removes them.
Recent and general model groups continue to contain only available models.

## Error handling

A failed favorite-store write restores the previous in-memory store and selector state.
Attempting to apply an unavailable model does not call `pi.setModel`.

## Verification

Verification covers:

- Available favorites render and remain selectable.
- Favorites lacking authentication render as unavailable and can be removed.
- Favorites removed from the catalog render from persisted IDs and can be removed.
- Unavailable favorites still count toward the configured favorite limit.
- Type checking succeeds for the package and active extension.
