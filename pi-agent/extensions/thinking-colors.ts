import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function thinkingColor(level: string): "thinkingOff" | "thinkingLow" | "thinkingMedium" | "thinkingHigh" | "thinkingXhigh" {
  switch (level) {
    case "minimal":
      return "thinkingOff";
    case "low":
      return "thinkingLow";
    case "medium":
      return "thinkingMedium";
    case "high":
      return "thinkingHigh";
    case "xhigh":
      return "thinkingXhigh";
    default:
      return "thinkingOff";
  }
}

export default function thinkingColorsHelper(_pi: ExtensionAPI) {}
