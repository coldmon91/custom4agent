#!/usr/bin/env node
"use strict";

// Cross-platform status line for Claude Code (Linux / macOS / Windows).
// Node.js is bundled with Claude Code, so it is always available on PATH,
// and all data (JSON, epoch time, user/host) is handled with the standard
// library — no jq / awk / date / whoami / hostname dependencies.

const os = require("os");
const { spawnSync } = require("child_process");

// --- ANSI helpers ---------------------------------------------------------
const RESET = "\x1b[0m";
const fg = (code) => `\x1b[38;5;${code}m`;
const paint = (code, text) => `${fg(code)}${text}${RESET}`;

// --- Read JSON payload from stdin -----------------------------------------
function readStdin() {
    try {
        return require("fs").readFileSync(0, "utf8");
    } catch {
        return "";
    }
}

let data = {};
try {
    data = JSON.parse(readStdin() || "{}");
} catch {
    data = {};
}

// Safe nested getter: get(obj, "a.b.c", fallback)
function get(obj, path, fallback) {
    const val = path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
    return val === undefined || val === null ? fallback : val;
}

// --- Extract fields --------------------------------------------------------
const cwd = get(data, "workspace.current_dir", process.cwd());
const model = get(data, "model.display_name", "?");
const cost = Number(get(data, "cost.total_cost_usd", 0)).toFixed(2);
const effort = get(data, "effort.level", "");

const fiveHourPct = get(data, "rate_limits.five_hour.used_percentage", null);
const sevenDayPct = get(data, "rate_limits.seven_day.used_percentage", null);
const fiveHourReset = get(data, "rate_limits.five_hour.resets_at", null);
const sevenDayReset = get(data, "rate_limits.seven_day.resets_at", null);

const inputTokens = Number(get(data, "context_window.current_usage.input_tokens", 0));
const cacheCreate = Number(get(data, "context_window.current_usage.cache_creation_input_tokens", 0));
const cacheRead = Number(get(data, "context_window.current_usage.cache_read_input_tokens", 0));
const ctxSize = Number(get(data, "context_window.context_window_size", 200000));

const usedTokens = inputTokens + cacheCreate + cacheRead;
const usedK = Math.floor(usedTokens / 1000);
const totalK = Math.floor(ctxSize / 1000);

// --- User & host -----------------------------------------------------------
let user = "?";
try {
    user = os.userInfo().username;
} catch {
    user = process.env.USER || process.env.USERNAME || "?";
}
// Short host name (strip domain part, mirrors `hostname -s`)
const host = (os.hostname() || "").split(".")[0];

// --- Git info --------------------------------------------------------------
function git(args) {
    // shell:false → identical behaviour on Windows/Unix, no quoting issues
    const r = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        timeout: 1000,
        windowsHide: true,
    });
    return r;
}

let gitInfo = "";
{
    const inRepo = git(["rev-parse", "--git-dir"]);
    if (inRepo.status === 0) {
        let branch = git(["symbolic-ref", "--short", "HEAD"]).stdout.trim();
        if (!branch) {
            branch = git(["rev-parse", "--short", "HEAD"]).stdout.trim();
        }
        if (branch) {
            const unstaged = git(["diff", "--quiet"]).status;
            const staged = git(["diff", "--cached", "--quiet"]).status;
            const dirty = unstaged !== 0 || staged !== 0 ? "*" : "";
            gitInfo =
                " " +
                fg(75) + "(" +
                fg(78) + branch +
                fg(214) + dirty +
                RESET + fg(75) + ")" + RESET;
        }
    }
}

// --- Display path (replace home with ~) -----------------------------------
const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || "";
let displayCwd;
if (home && cwd === home) {
    displayCwd = "~";
} else if (home && cwd.startsWith(home + require("path").sep)) {
    displayCwd = "~" + cwd.slice(home.length);
} else {
    displayCwd = cwd;
}

// --- Reset-time hint (local time) -----------------------------------------
const pad2 = (n) => String(n).padStart(2, "0");
function fmtReset(epoch, kind) {
    if (epoch == null || epoch === "") return "";
    const d = new Date(Number(epoch) * 1000);
    if (isNaN(d.getTime())) return "";
    let when;
    if (kind === "time") {
        when = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    } else {
        when = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return paint(244, `(→${when})`);
}

// --- Color pickers ---------------------------------------------------------
function rateLimitColor(pct) {
    const p = Math.trunc(Number(pct) || 0);
    if (p < 50) return 78; // green
    if (p < 80) return 226; // yellow
    return 196; // red
}

// --- Build output ----------------------------------------------------------
let out = "";

// Line 1: user@host  path  (git)
out += paint(244, `${user}@${host}`) + " ";
out += paint(32, displayCwd);
out += gitInfo;
out += "\n";

// Line 2: [model] ⚡effort $cost tokens rate-limits
out += " " + paint(51, `[${model}]`);

if (effort) {
    const effortColors = { low: 244, medium: 78, high: 226, xhigh: 208, max: 196 };
    const c = effortColors[effort] || 255;
    out += " " + paint(c, `⚡${effort}`);
}

out += " " + paint(226, `$${cost}`);

// Token usage: white < 50% < magenta < 80% < red
const pct = ctxSize > 0 ? Math.floor((usedTokens * 100) / ctxSize) : 0;
const tokenColor = pct < 50 ? 255 : pct < 80 ? 177 : 196;
out += " " + paint(tokenColor, `${usedK}K/${totalK}K`);

// Rate limits
if (fiveHourPct != null || sevenDayPct != null) {
    out += " ";
    if (fiveHourPct != null) {
        const disp = Math.round(Number(fiveHourPct));
        out += paint(rateLimitColor(disp), `5H:${disp}%`);
        out += fmtReset(fiveHourReset, "time");
    }
    if (sevenDayPct != null) {
        if (fiveHourPct != null) out += " ";
        const disp = Math.round(Number(sevenDayPct));
        out += paint(rateLimitColor(disp), `7D:${disp}%`);
        out += fmtReset(sevenDayReset, "date");
    }
}

process.stdout.write(out);
