import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const LOG_FILE = "model-thinking-selector.log";

export async function writeSelectorDiagnostic(logDir: string, event: string, error?: unknown): Promise<void> {
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
    await mkdir(logDir, { recursive: true, mode: 0o700 });
    await appendFile(join(logDir, LOG_FILE), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch (writeError) {
    console.error(`Failed to write ${LOG_FILE}:`, writeError);
  }
}

export async function withSelectorDiagnostics<T>(logDir: string, run: () => Promise<T>): Promise<T> {
  await writeSelectorDiagnostic(logDir, "shortcut invoked");
  try {
    const result = await run();
    await writeSelectorDiagnostic(logDir, "handler completed");
    return result;
  } catch (error) {
    await writeSelectorDiagnostic(logDir, "handler failed", error);
    throw error;
  }
}
