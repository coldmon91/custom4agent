import { appendFile } from "node:fs/promises";
import { join } from "node:path";

const LOG_FILE = "model-thinking-selector.log";

export async function writeSelectorDiagnostic(agentDir: string, event: string, error?: unknown): Promise<void> {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...(error === undefined
      ? {}
      : {
          error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
        }),
  };

  try {
    await appendFile(join(agentDir, LOG_FILE), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch (writeError) {
    console.error(`Failed to write ${LOG_FILE}:`, writeError);
  }
}

export async function withSelectorDiagnostics<T>(agentDir: string, run: () => Promise<T>): Promise<T> {
  await writeSelectorDiagnostic(agentDir, "shortcut invoked");
  try {
    const result = await run();
    await writeSelectorDiagnostic(agentDir, "handler completed");
    return result;
  } catch (error) {
    await writeSelectorDiagnostic(agentDir, "handler failed", error);
    throw error;
  }
}
