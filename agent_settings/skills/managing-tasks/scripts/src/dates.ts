import { TaskError } from "./errors.ts";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar date as YYYY-MM-DD. */
export function today(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseDateOption(value: string | undefined): string {
  if (value === undefined) return today();
  if (!DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TaskError("invalid_value", `date must be YYYY-MM-DD: ${value}`);
  }
  return value;
}
