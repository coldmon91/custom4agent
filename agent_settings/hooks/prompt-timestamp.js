#!/usr/bin/env node
// UserPromptSubmit hook: show prompt submission time in the terminal.
// Pure Node so the same file works on macOS, Linux and Windows.

const STDIN_DRAIN_TIMEOUT_MS = 1500;

const pad = (n) => String(n).padStart(2, "0");

// YYYYMMDD_HH:mm:ss in local time.
function formatStamp(d) {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

let done = false;

function emit() {
  if (done) {
    return;
  }
  done = true;
  clearTimeout(timer);
  process.stdout.write(
    `${JSON.stringify({ systemMessage: `⏱ ${formatStamp(new Date())}` })}\n`
  );
}

// Drain stdin so Claude Code's JSON write never hits EPIPE; emit on close,
// on error, or on timeout if the pipe is never closed.
const timer = setTimeout(emit, STDIN_DRAIN_TIMEOUT_MS);
timer.unref();
process.stdin.on("error", emit);
process.stdin.on("end", emit);
process.stdin.resume();
