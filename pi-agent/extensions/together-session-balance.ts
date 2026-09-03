import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";

const PROVIDER = "together";
const TOKEN_FORMATTER = new Intl.NumberFormat("en-US");

export type UsageTotals = {
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};

export type TogetherSessionUsage = UsageTotals & {
  models: Array<{ model: string; totals: UsageTotals }>;
};

type RecordedUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: { total: number };
};

function emptyTotals(): UsageTotals {
  return { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addUsage(target: UsageTotals, usage: RecordedUsage): void {
  target.requests += 1;
  target.input += finiteOrZero(usage.input);
  target.output += finiteOrZero(usage.output);
  target.cacheRead += finiteOrZero(usage.cacheRead);
  target.cacheWrite += finiteOrZero(usage.cacheWrite);
  target.cost += finiteOrZero(usage.cost?.total);
}

export function calculateTogetherSessionUsage(
  entries: readonly SessionEntry[],
): TogetherSessionUsage {
  const totals = emptyTotals();
  const totalsByModel = new Map<string, UsageTotals>();

  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "assistant") {
      continue;
    }

    const message = entry.message;
    if (message.provider !== PROVIDER) {
      continue;
    }

    const model = message.responseModel?.trim() || message.model;
    let modelTotals = totalsByModel.get(model);
    if (!modelTotals) {
      modelTotals = emptyTotals();
      totalsByModel.set(model, modelTotals);
    }

    addUsage(totals, message.usage);
    addUsage(modelTotals, message.usage);
  }

  const models = [...totalsByModel.entries()]
    .map(([model, modelTotals]) => ({ model, totals: modelTotals }))
    .sort(
      (left, right) =>
        right.totals.cost - left.totals.cost || left.model.localeCompare(right.model),
    );

  return { ...totals, models };
}

function totalTokens(usage: UsageTotals): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

export function formatTogetherStatus(usage: TogetherSessionUsage): string {
  // 3 decimals, rounded — consistent with the footer's branch cost display.
  return `$${usage.cost.toFixed(3)}`;
}

export function formatTogetherDetails(usage: TogetherSessionUsage): string {
  const lines = [
    `Together session usage: $${usage.cost.toFixed(6)}`,
    `Requests: ${TOKEN_FORMATTER.format(usage.requests)}`,
    `Tokens: ${TOKEN_FORMATTER.format(totalTokens(usage))}`,
  ];

  if (usage.models.length > 0) {
    lines.push(
      "",
      ...usage.models.map(({ model, totals }) => `${model}: $${totals.cost.toFixed(6)}`),
    );
  }

  return lines.join("\n");
}

export default function togetherSessionBalance(pi: ExtensionAPI): void {
  pi.registerCommand("together-balance", {
    description: "Show Together usage for the entire current pi session",
    handler: async (_args, ctx) => {
      const usage = calculateTogetherSessionUsage(ctx.sessionManager.getEntries());
      ctx.ui.notify(formatTogetherDetails(usage), "info");
    },
  });
}
