# JavaScript / TypeScript

## Entry points and registration
- Express / Koa / Fastify: `app.get(`, `app.post(`, `router.`, `createRouter(`, middleware chains `use(`
- Next.js route handlers (`export async function GET|POST`) and server actions
- Events: `addEventListener(`, `on(`, `emit(`
- Workers and schedules: `queue.process`, `cron.schedule`, `setInterval(`, `setTimeout(`
- React rendering alone does not prove a function runs; require a runtime path.

## Path-specific patterns
- Promises: `.then()` / `.catch()` / `.finally()`, `Promise.all`, `Promise.race`. Trace what resolves or rejects the chain; a long or conditional chain lowers confidence.
- Dynamic: `handlers[key]()`, dynamic `import()`, env-selected handlers. Trace where the key comes from (user input, config, DB).
- Flags: env checks, flag SDKs (LaunchDarkly, Unleash, Statsig). Framework and runtime versions live in `package.json` or lock files.
