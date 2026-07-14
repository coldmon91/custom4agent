---
name: analysis-log
description: "Comprehensive log file analysis and troubleshooting. Use when the user asks to analyze, debug, or explain log files. Identifies errors, explains current state, performs root cause analysis, and correlates events across multiple log files with precise timestamp tracking (millisecond precision)."
---

# Log Analyzer

Analyze application and system log files to identify errors, explain system state, determine root causes, and correlate events across multiple logs.

## Analysis Workflow

### 1. Parse and Understand Structure

Identify the log format:
- Timestamp format (ISO 8601, Unix timestamp, custom)
- Log levels (INFO, DEBUG, WARN, ERROR, FATAL)
- Structured vs unstructured logs
- Key fields (timestamp, level, message, thread/process ID, source)

### 2. Analyze Current State and Errors

**State Analysis:**
- Summarize what the system/application is doing
- Identify the current operational state and any state transitions

**Error Detection:**
- Locate ERROR and FATAL level messages
- Identify warning signs that preceded errors
- Extract error codes, stack traces, and exception types
- Quote exact error messages with timestamps

**Timestamp Precision:**
- ALWAYS include timestamps with millisecond precision when available
- Format: `YYYY-MM-DD HH:MM:SS.mmm`

### 3. Root Cause Analysis

**Trace Backward:**
- Find the earliest sign of the problem
- Identify triggering events or conditions
- Look for cascading failures

**Hypothesis Formation:**
- Propose likely causes based on evidence
- Distinguish between symptoms and root causes

### 4. Multi-File Correlation

When multiple log files are provided:

- Align events by timestamp (match within milliseconds)
- Look for request/transaction IDs, session IDs, correlation tokens across logs
- Track IP addresses, ports, thread/process IDs
- Build a unified timeline and mark causal relationships

Example:
```
[client.log] 14:23:45.127 - Request sent (req_id: abc123)
[server.log] 14:23:45.129 - Request received (req_id: abc123)
[server.log] 14:23:47.431 - Database timeout (req_id: abc123)
[client.log] 14:23:47.433 - 500 Internal Server Error received
```

## Output Structure

1. **Executive Summary** — 2-3 sentence overview
2. **Current State** — what the system is doing
3. **Errors Identified** — timestamp, type, exact message, location
4. **Root Cause Analysis** — immediate cause, underlying issues, evidence
5. **Multi-File Correlation** (if applicable) — timeline, causal relationships
6. **Recommendations** (optional) — suggested fixes or investigation steps
