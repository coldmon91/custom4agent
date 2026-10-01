function toolLabel(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.:-]/g, "?").slice(0, 40) || "tool";
}

function secondsSince(now: number, then: number): number {
  return Math.max(0, Math.floor((now - then) / 1000));
}

export class ProgressState {
  private startedAt: number | undefined;
  private lastEventAt = 0;
  private phase = "Waiting for model";
  private promptKind: string | undefined;
  private tools = new Map<string, string>();

  start(now: number, phase = "Waiting for model"): void {
    this.stop();
    this.startedAt = now;
    this.lastEventAt = now;
    this.phase = phase;
  }

  stop(): void {
    this.startedAt = undefined;
    this.promptKind = undefined;
    this.tools.clear();
  }

  observe(now: number): void {
    if (this.startedAt !== undefined) this.lastEventAt = now;
  }

  modelPhase(phase: string, now: number): void {
    this.observe(now);
    if (this.tools.size === 0) this.phase = phase;
  }

  startTool(id: string, name: string, now: number): void {
    this.observe(now);
    this.tools.set(id, toolLabel(name));
  }

  endTool(id: string, isError: boolean, now: number): void {
    this.observe(now);
    const name = this.tools.get(id);
    if (!name) return;
    this.tools.delete(id);
    for (const childId of this.tools.keys()) {
      if (childId.startsWith(`${id}/`)) this.tools.delete(childId);
    }
    if (this.tools.size === 0) {
      this.phase = `${name}: ${isError ? "failed" : "completed"} · follow-up`;
    }
  }

  startPrompt(kind: string, now: number): void {
    this.observe(now);
    this.promptKind = kind;
  }

  endPrompt(now: number): void {
    this.observe(now);
    this.promptKind = undefined;
  }

  format(now: number): string | undefined {
    if (this.startedAt === undefined) return undefined;
    let label = this.phase;
    if (this.promptKind) {
      label = this.promptKind === "confirm" ? "Waiting for approval" : "Waiting for input";
    } else if (this.tools.size > 0) {
      const name = [...this.tools.values()].at(-1)!;
      // Pi emits tool_execution_start before permission checks and execution.
      label = `${name}: processing${this.tools.size > 1 ? ` (${this.tools.size} tools)` : ""}`;
    }
    return `${label} · ${secondsSince(now, this.startedAt)}s · last event ${secondsSince(now, this.lastEventAt)}s ago`;
  }
}
