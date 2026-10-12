#!/usr/bin/env node
// Entry point kept as plain JS so an unsupported Node version gets a clear message
// instead of failing to parse the TypeScript sources.
const MIN_MAJOR = 22;
const MIN_MINOR = 18;

const [major, minor] = process.versions.node.split(".").map(Number);
const supported = major > MIN_MAJOR || (major === MIN_MAJOR && minor >= MIN_MINOR);
if (!supported || !process.features?.typescript) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: {
        code: "node_unsupported",
        message: `Node ${MIN_MAJOR}.${MIN_MINOR} or later is required (current: ${process.versions.node}). Install it from https://nodejs.org`,
      },
    }) + "\n",
  );
  process.exit(1);
}

// Type stripping and node:sqlite emit ExperimentalWarning on stderr; other warnings stay visible.
process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name !== "ExperimentalWarning") console.error(warning);
});

const { main } = await import("./src/cli.ts");
process.exitCode = main(process.argv.slice(2));
