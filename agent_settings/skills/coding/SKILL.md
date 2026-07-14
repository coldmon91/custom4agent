---
name: coding
description: Read when you need to write code for socket programming, multi-threading, or other programming tasks.
---

# Coding Rules

## Socket Programming

- TCP/TLS/UDP reads may arrive fragmented (e.g. 1000 bytes sent as 500+500).
- Use a length-prefixed header: read header first, then read body per its length.

## Multi-Thread Programming

- Mark shared resources; synchronize all access to them.
