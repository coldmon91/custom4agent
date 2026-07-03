# JavaScript / TypeScript Checklist

Check for:
- Express / Koa / Fastify route registration
- Next.js route handlers and server actions
- event emitters and listeners
- middleware chains
- cron / queue workers
- dynamic imports and string-keyed handlers
- React is usually not a stable execution proof for a function unless connected through runtime code paths

Useful search patterns:
- `app.get(`, `app.post(`, `router.`, `createRouter`, `addEventListener`, `on(`, `emit(`
- `setTimeout(`, `setInterval(`, `queue.process`, `cron.schedule`

## Async and Concurrency Patterns

Check for:
- `.then()`, `.catch()`, `.finally()` callback chains
- async function composition, `Promise.all`, `Promise.race`
- `setTimeout()`, `setInterval()`

Async-specific guidance:
- Track where callbacks are registered and what resolves or rejects the promise chain.
- Identify the event loop or runtime that drives execution.
- Mark confidence as reduced if callback chains are long or conditional.
- Mark scheduled paths with execution time windows.

## Error Control Flow

Check for:
- `try` / `catch` / `finally` branches
- whether thrown errors escape to callers or are handled locally

Error-specific guidance:
- `finally` blocks still run before `return` or `throw` paths complete.
- Treat error-only paths as reachable only when the triggering failure source is explained.

## Dynamic Loading and Generated Code

Check for:
- `handlers[key]()`, dynamic property access
- import-time module loading or environment-selected handlers

Dynamic-specific guidance:
- Trace where string keys originate, such as user input, config, or database values.
- Mark paths as low-confidence if the dispatch target depends on runtime-selected keys or environment-dependent loading.

## Conditional Compilation and Feature Flags

Check for:
- environment checks and flag SDK usage such as LaunchDarkly, Unleash, or Statsig
- framework or runtime version assumptions in `package.json` or lock files

Feature-flag guidance:
- Trace whether the flag source is external environment or internal code configuration.
- If the flag can change in a running system, mark timing as uncertain.
- Mark explicitly when analysis depends on framework or runtime version assumptions.
