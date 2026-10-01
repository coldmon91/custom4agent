const PREFIX = "Working on: ";
const MAX_GOAL_LENGTH = 80;
const MAX_GOAL_WORDS = 12;
const MAX_LINE_LENGTH = PREFIX.length + MAX_GOAL_LENGTH + 1;

export class WorkingGoal {
  private goal: string | undefined;
  private firstLine = "";
  private firstLineDone = false;

  reset(): void {
    this.goal = undefined;
    this.beginMessage();
  }

  beginMessage(): void {
    this.firstLine = "";
    this.firstLineDone = false;
  }

  append(delta: string): void {
    if (this.firstLineDone) return;
    const newline = delta.indexOf("\n");
    const chunk = newline === -1 ? delta : delta.slice(0, newline);
    if (this.firstLine.length + chunk.length > MAX_LINE_LENGTH) {
      this.discardLine();
      return;
    }
    this.firstLine += chunk;
    if (!PREFIX.startsWith(this.firstLine) && !this.firstLine.startsWith(PREFIX)) {
      this.discardLine();
      return;
    }
    if (newline !== -1) this.finishText();
  }

  finishText(content?: string): void {
    if (this.firstLineDone) return;
    if (content !== undefined) {
      this.firstLine = "";
      this.append(content);
      if (this.firstLineDone) return;
    }
    const line = this.firstLine.replace(/\r$/, "");
    this.discardLine();
    if (!line.startsWith(PREFIX)) return;
    const candidate = line.slice(PREFIX.length).replace(/^ +| +$/g, "");
    if (candidate.length === 0 || candidate.length > MAX_GOAL_LENGTH) return;
    if (candidate.split(/ +/).length > MAX_GOAL_WORDS) return;
    if (!/^[A-Za-z][A-Za-z0-9 ,.'()+-]*$/.test(candidate)) return;
    if (/\bsk-[A-Za-z0-9-]+|\b[A-Za-z0-9]{24,}\b/.test(candidate)) return;
    this.goal = candidate;
  }

  format(): string {
    return `${PREFIX}${this.goal ?? "Awaiting task summary"}`;
  }

  private discardLine(): void {
    this.firstLine = "";
    this.firstLineDone = true;
  }
}
