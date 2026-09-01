import { getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "./models";

// ~/.pi/agent/settings.json is shared with the running pi process; serialize writes.
let writeQueue: Promise<void> = Promise.resolve();

/**
 * pi only writes the startup model to settings.json when its own picker is used
 * with `persist`; the extension API's setModel() is always session-scoped. Mirror
 * the selection into global settings so the next session starts from it.
 */
function enqueue(label: string, apply: (settings: SettingsManager) => void): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      // Reload per write: the running pi process holds its own instance, and
      // SettingsManager merges only the fields it modified under a file lock.
      const settings = SettingsManager.create(process.cwd(), getAgentDir(), { projectTrusted: false });
      apply(settings);
      await settings.flush();
    })
    .catch((error) => {
      console.error(`Failed to persist ${label} to settings.json:`, error);
    });

  return writeQueue;
}

export function persistDefaultModel(provider: string, modelId: string): Promise<void> {
  return enqueue("default model", (settings) => {
    settings.setDefaultModelAndProvider(provider, modelId);
  });
}

export function persistModelThinkingLevel(
  provider: string,
  modelId: string,
  level: ThinkingLevel,
): Promise<void> {
  return enqueue("model thinking level", (settings) => {
    settings.setModelThinkingLevel(provider, modelId, level);
  });
}
