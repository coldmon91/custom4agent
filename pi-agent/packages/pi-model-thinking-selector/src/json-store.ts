import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/** Resolve a state file kept next to pi's own agent settings. */
export function agentFilePath(fileName: string): string {
  return join(getAgentDir(), fileName);
}

/** Read and parse a JSON file, returning undefined when missing or malformed. */
export async function readJsonFile(fileName: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(agentFilePath(fileName), "utf8"));
  } catch {
    return undefined;
  }
}

/** Write via a pid-scoped temp file so a crash cannot leave a truncated store. */
export async function writeJsonFile(fileName: string, data: unknown): Promise<void> {
  const filePath = agentFilePath(fileName);
  await mkdir(getAgentDir(), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

export function readString(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
