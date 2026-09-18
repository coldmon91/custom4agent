import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Codex (openai-codex provider) rate-limit usage for the footer.
 *
 * The ChatGPT Codex backend reports the 5h / 7d usage windows on every turn:
 *   - WebSocket transport: a `codex.rate_limits` stream event
 *   - SSE transport: `x-codex-*-used-percent` response headers
 * pi discards both, so this extension sniffs them passively from the runtime
 * globals instead of spending an extra request to ask for the numbers.
 */

export const CODEX_PROVIDER = "openai-codex";

const CODEX_RESPONSES_PATH = "/codex/responses";
const RATE_LIMIT_EVENT_TYPE = "codex.rate_limits";
const MAX_SNIFFED_FRAME_BYTES = 8192;
const CACHE_FILE = "codex-usage.json";
const USAGE_CHANGED_EVENT = "codex-usage:changed";
const WARN_PERCENT = 70;
const CRITICAL_PERCENT = 90;

export type CodexUsageWindow = {
  usedPercent: number;
  windowMinutes: number;
  resetAt?: number;
};

export type CodexUsageSnapshot = {
  primary?: CodexUsageWindow;
  secondary?: CodexUsageWindow;
  capturedAt: number;
};

type Listener = () => void;

let snapshot: CodexUsageSnapshot | undefined;
let snapshotLoaded = false;
let sniffersInstalled = false;
const listeners = new Set<Listener>();

// ---------------------------------------------------------------------------
// Snapshot state
// ---------------------------------------------------------------------------

function cachePath(): string {
  return join(getAgentDir(), CACHE_FILE);
}

function loadSnapshot(force = false): void {
  if (snapshotLoaded && !force) return;
  snapshotLoaded = true;
  try {
    const parsed = JSON.parse(readFileSync(cachePath(), "utf-8")) as CodexUsageSnapshot;
    if (typeof parsed?.capturedAt === "number") snapshot = parsed;
  } catch {
    // No cache yet, or unreadable — the next turn refreshes it.
  }
}

function persistSnapshot(next: CodexUsageSnapshot): void {
  try {
    writeFileSync(cachePath(), `${JSON.stringify(next, null, 2)}\n`);
  } catch {
    // A stale cache is harmless; never break a turn over it.
  }
}

function publishSnapshot(next: CodexUsageSnapshot): void {
  snapshot = next;
  snapshotLoaded = true;
  persistSnapshot(next);
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A failing subscriber must not stop the others.
    }
  }
}

export function getCodexUsage(): CodexUsageSnapshot | undefined {
  loadSnapshot();
  return snapshot;
}

export function onCodexUsageChange(
  listener: Listener,
  events?: ExtensionAPI["events"],
): () => void {
  if (events) {
    loadSnapshot(true);
    return events.on(USAGE_CHANGED_EVENT, (next: CodexUsageSnapshot) => {
      snapshot = next;
      snapshotLoaded = true;
      listener();
    });
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseWindow(raw: unknown): CodexUsageWindow | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const usedPercent = finiteOrUndefined(source.used_percent);
  const windowMinutes = finiteOrUndefined(source.window_minutes);
  if (usedPercent === undefined || windowMinutes === undefined) return undefined;
  return { usedPercent, windowMinutes, resetAt: finiteOrUndefined(source.reset_at) };
}

function parseRateLimitEvent(payload: unknown): CodexUsageSnapshot | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const limits = (payload as Record<string, unknown>).rate_limits;
  if (!limits || typeof limits !== "object") return undefined;
  const source = limits as Record<string, unknown>;
  const primary = parseWindow(source.primary);
  const secondary = parseWindow(source.secondary);
  if (!primary && !secondary) return undefined;
  return { primary, secondary, capturedAt: Date.now() };
}

function headerNumber(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseRateLimitHeaders(headers: Headers): CodexUsageSnapshot | undefined {
  const build = (prefix: string): CodexUsageWindow | undefined => {
    const usedPercent = headerNumber(headers, `x-codex-${prefix}-used-percent`);
    const windowMinutes = headerNumber(headers, `x-codex-${prefix}-window-minutes`);
    if (usedPercent === undefined || windowMinutes === undefined) return undefined;
    return {
      usedPercent,
      windowMinutes,
      resetAt: headerNumber(headers, `x-codex-${prefix}-reset-at`),
    };
  };

  const primary = build("primary");
  const secondary = build("secondary");
  if (!primary && !secondary) return undefined;
  return { primary, secondary, capturedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Passive sniffers
// ---------------------------------------------------------------------------

function isCodexResponsesUrl(url: unknown): boolean {
  const text =
    typeof url === "string"
      ? url
      : url instanceof URL
        ? url.href
        : typeof (url as Request | undefined)?.url === "string"
          ? (url as Request).url
          : "";
  return text.includes(CODEX_RESPONSES_PATH);
}

function decodeFrame(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > MAX_SNIFFED_FRAME_BYTES) return undefined;
    return Buffer.from(data).toString("utf-8");
  }
  if (ArrayBuffer.isView(data as ArrayBufferView)) {
    const view = data as ArrayBufferView;
    if (view.byteLength > MAX_SNIFFED_FRAME_BYTES) return undefined;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("utf-8");
  }
  return undefined;
}

function sniffFrame(data: unknown): void {
  const text = decodeFrame(data);
  // Cheap guard first: output deltas dominate the stream and must not be parsed.
  if (!text || !text.includes(RATE_LIMIT_EVENT_TYPE)) return;
  try {
    const next = parseRateLimitEvent(JSON.parse(text));
    if (next) publishSnapshot(next);
  } catch {
    // Not the event we are after.
  }
}

function installWebSocketSniffer(): void {
  const OriginalWebSocket = globalThis.WebSocket;
  if (typeof OriginalWebSocket !== "function") return;

  class SniffingWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, ...rest: unknown[]) {
      // @ts-expect-error - forward the host-specific option bag untouched.
      super(url, ...rest);
      if (!isCodexResponsesUrl(url)) return;
      this.addEventListener("message", (event) => sniffFrame((event as MessageEvent).data));
    }
  }

  Object.defineProperty(globalThis, "WebSocket", {
    value: SniffingWebSocket,
    configurable: true,
    writable: true,
  });
}

function installFetchSniffer(): void {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") return;

  globalThis.fetch = async function sniffingFetch(input, init) {
    const response = await originalFetch(input, init);
    if (isCodexResponsesUrl(input)) {
      try {
        const next = parseRateLimitHeaders(response.headers);
        if (next) publishSnapshot(next);
      } catch {
        // Header sniffing is best-effort; never disturb the response.
      }
    }
    return response;
  } as typeof globalThis.fetch;
}

function installSniffers(): void {
  if (sniffersInstalled) return;
  sniffersInstalled = true;
  installWebSocketSniffer();
  installFetchSniffer();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatWindowLabel(windowMinutes: number): string {
  if (windowMinutes % 1440 === 0) return `${windowMinutes / 1440}d`;
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return `${windowMinutes}m`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Theme color name for a usage percentage. */
export function usageColor(usedPercent: number): "dim" | "warning" | "error" {
  if (usedPercent >= CRITICAL_PERCENT) return "error";
  if (usedPercent >= WARN_PERCENT) return "warning";
  return "dim";
}

export type CodexUsagePart = { label: string; usedPercent: number };

/** Footer parts, oldest-known snapshot included; empty when nothing was captured yet. */
export function getCodexUsageParts(): CodexUsagePart[] {
  const usage = getCodexUsage();
  if (!usage) return [];
  const parts: CodexUsagePart[] = [];
  for (const window of [usage.primary, usage.secondary]) {
    if (!window) continue;
    parts.push({
      label: formatWindowLabel(window.windowMinutes),
      usedPercent: window.usedPercent,
    });
  }
  return parts;
}

export function formatCodexUsageStatus(): string {
  const parts = getCodexUsageParts();
  if (parts.length === 0) return "";
  return parts.map((part) => `${part.label} ${Math.round(part.usedPercent)}%`).join(" · ");
}

function formatDetails(): string {
  const usage = getCodexUsage();
  if (!usage) {
    return "No Codex usage captured yet. It is recorded on the first openai-codex response.";
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lines = ["Codex rate limits:"];
  for (const window of [usage.primary, usage.secondary]) {
    if (!window) continue;
    const reset =
      window.resetAt !== undefined ? `, resets in ${formatDuration(window.resetAt - nowSeconds)}` : "";
    lines.push(`  ${formatWindowLabel(window.windowMinutes)}: ${window.usedPercent}%${reset}`);
  }
  lines.push("", `Captured ${formatDuration(Math.floor((Date.now() - usage.capturedAt) / 1000))} ago`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function codexUsageLimits(pi: ExtensionAPI): void {
  installSniffers();
  loadSnapshot();

  let offPublish: (() => void) | undefined;
  pi.on("session_start", () => {
    offPublish?.();
    offPublish = onCodexUsageChange(() => pi.events.emit(USAGE_CHANGED_EVENT, snapshot));
  });
  pi.on("session_shutdown", () => {
    offPublish?.();
    offPublish = undefined;
  });

  // Covers the SSE transport even when another extension replaced global fetch.
  pi.on("after_provider_response", (event) => {
    const primaryPercent = event.headers["x-codex-primary-used-percent"];
    if (primaryPercent === undefined) return;
    const next = parseRateLimitHeaders(new Headers(event.headers));
    if (next) publishSnapshot(next);
  });

  pi.registerCommand("codex-usage", {
    description: "Show Codex 5h / 7d rate-limit usage",
    handler: async (_args, ctx) => {
      ctx.ui.notify(formatDetails(), "info");
    },
  });
}
