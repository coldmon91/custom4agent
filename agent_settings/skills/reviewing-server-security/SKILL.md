---
name: reviewing-server-security
description: "Use when asked to improve, harden, audit, or review the security of a server or network program from its source code and config files, including vague requests with no checklist - '보안성 높여줘', '보안 점검', '보안 검토', '취약점 찾아줘', 'security review', 'harden this server'. Static review only; no live probing of running hosts."
---

# Reviewing Server Security

## Overview

Static, read-only security review of a server program from source and config.
Every checklist item ends with a verdict, so the report shows what was checked, not only what was found.
Defense layers L1-L5 follow GTIG/Mandiant guidance on agentic intrusion frameworks: automated attackers chain small weaknesses in minutes and use error messages as feedback.

## Scope rules

- Read-only: never modify files, build, run, or connect to any host.
- Evidence is `file:line`. A claim without evidence is `Unknown`, not `Vulnerable`.
- Source cannot prove deployed state. Record it as `Unknown` with the exact check that would settle it.

## Checklist

Give each item exactly one verdict: `OK`, `Vulnerable`, `Unknown`, or `N/A`.

**L1 Exposure**
- L1-1 Every listener: port, default bind address, transport (TLS / plaintext / custom), authentication required.
- L1-2 Management, internal, or server-to-server interfaces reachable from outside by default.

**L2 Identity and keys**
- L2-1 Secrets in version control, sample configs, or build images (`git ls-files`, Dockerfile `COPY`).
- L2-2 Stored credentials: plaintext, home-made crypto (fixed IV, hardcoded key), unchecked decrypt failure.
- L2-3 Peer authentication: what proves a client's identity; whether a duplicate ID can replace a live session.
- L2-4 Outbound TLS: certificate verification disabled, redirects followed.

**L3 Hardening**
- L3-1 Trace each security config key from parse to effect. Note the default when the key is missing, and when a library default (e.g. TLS security level) decides the real behavior.
- L3-2 Paths that bypass the security library: legacy or compatibility handshakes, plaintext fallbacks; whether config can disable them.
- L3-3 Untrusted input into fixed buffers (`sprintf`, `strcpy`, `memcpy`), length fields, per-packet recursion.
- L3-4 Client-supplied URL, host, or path used for a server-side request (SSRF).
- L3-5 **Error feedback to unauthenticated peers**: distinct replies that reveal existence (enumeration oracle), versions, internal paths, library error strings.
- L3-6 Build hardening flags (stack protector, FORTIFY, PIE, RELRO) and the runtime user (Dockerfile, service unit).

**L4 Feature abuse**
- L4-1 Fan-out or bulk operations (broadcast, mass notify, bulk delete): who can trigger them, with what limit.
- L4-2 Limits before authentication: connections total and per IP, buffer growth, handshake and idle timeouts, request rate.

**L5 Detection**
- L5-1 **Security events logged at a level enabled in production, with source IP**: auth failure, blocked IP, replaced session, bypass-path use, oversized packet, config fallback. Flag logs that print success when the result was not checked.
- L5-2 Sensitive data (IDs, tokens, POST bodies) in logs at the default level.
- L5-3 Outbound destinations the program contacts, listed so operators can allowlist egress.

L3-5 and L5-1 are the items most often skipped. Check them explicitly.

## Method

1. List tracked secrets and config files first; they are the cheapest risks to confirm.
2. Enumerate listeners, then trace each handler for authentication and input-size checks.
3. Follow config keys into code (L3-1).
4. Search outbound HTTP/socket clients (L2-4, L3-4, L5-3).
5. Walk the remaining checklist items.

## Report format

1. **Findings**, highest priority first. For each: ID, layer, severity, `file:line`, attack scenario in one sentence, fix.
2. **Coverage**: every checklist item with its verdict and one line of evidence.
3. **Unknown from source**: deployed config values, linked library versions, firewall and upstream limits, client behavior - each with the check that would settle it.
4. **Priority plan**: order fixes by impact divided by effort; mark fixes that need a protocol or client change.
