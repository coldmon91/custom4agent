import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskError } from "./errors.ts";
import { markdownFiles, sleepSync } from "./file-ops.ts";
import { getScalar } from "./frontmatter.ts";
import { parseText } from "./text-file.ts";

const TASK_ID = /^(\d{4})-(\d{6})$/;
const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 100;

export function formatTaskId(year: string, serial: number): string {
  return `${year}-${String(serial).padStart(6, "0")}`;
}

export function maxSerial(tasksDir: string, year: string): number {
  let max = 0;
  for (const path of markdownFiles(tasksDir)) {
    const match = TASK_ID.exec(getScalar(parseText(readFileSync(path, "utf8")).lines, "task-id") ?? "");
    if (match && match[1] === year) max = Math.max(max, Number(match[2]));
  }
  return max;
}

/**
 * Serializes id assignment between agent sessions on this machine. The lock lives in the
 * OS temp dir, not the vault, so a synced vault never carries a stale lock to another device.
 */
function withLock<T>(tasksDir: string, action: () => T): T {
  const key = createHash("sha1").update(tasksDir).digest("hex").slice(0, 16);
  const lockDir = join(tmpdir(), `managing-tasks-${key}.lock`);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lockDir); // atomic on every platform: fails with EEXIST when held
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (isStale(lockDir)) {
        try {
          rmdirSync(lockDir);
        } catch {
          // another process removed it first
        }
        continue;
      }
      if (Date.now() > deadline) throw new TaskError("locked", `task-id lock is busy: ${lockDir}`, { lockDir });
      sleepSync(LOCK_POLL_MS);
    }
  }
  try {
    return action();
  } finally {
    rmdirSync(lockDir);
  }
}

function isStale(lockDir: string): boolean {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false; // released between the failed mkdir and this check
  }
}

/** Computes the next id for `year` and lets `persist` write it while still holding the lock. */
export function assignTaskId(tasksDir: string, year: string, persist: (taskId: string) => void): string {
  return withLock(tasksDir, () => {
    const taskId = formatTaskId(year, maxSerial(tasksDir, year) + 1);
    persist(taskId);
    return taskId;
  });
}
