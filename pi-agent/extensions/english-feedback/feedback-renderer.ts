import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

export const ENGLISH_FEEDBACK_ENTRY_TYPE = "english-feedback";

export interface EnglishFeedbackEntry {
  text: string;
}

export function registerFeedbackRenderer(pi: ExtensionAPI): void {
  pi.registerEntryRenderer<EnglishFeedbackEntry>(
    ENGLISH_FEEDBACK_ENTRY_TYPE,
    (entry, _options, theme) => {
      if (!entry.data || typeof entry.data.text !== "string" || !entry.data.text) {
        return undefined;
      }

      return new Text(
        `${theme.fg("accent", "English:")} ${entry.data.text}`,
        0,
        0,
      );
    },
  );
}
