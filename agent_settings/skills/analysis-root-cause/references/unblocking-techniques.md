# Unblocking Techniques

Techniques for when the repro is missing, the bug is intermittent, or hypotheses keep failing.
Pick the section that matches the blockage.

## Raising the failure rate of an intermittent bug

- **Loop until failure**, with a timeout per run:
  `for i in $(seq 1 500); do timeout 30 ./repro || { echo "failed at run $i"; break; }; done`
- **Add load**: parallel clients, CPU contention (`stress-ng --cpu N`), shorter timeouts.
- **Change scheduling**: pin to one CPU (`taskset -c 0`) to change interleaving, spread across many cores to maximize it, or record under `rr record --chaos`.
- **Widen the suspect window**: insert a sleep or yield between the two operations the hypothesis says race (e.g. between lookup and use).
  A jump in failure rate is itself evidence for the hypothesis.
- **Shrink resources**: `ulimit -n`, cgroup memory limit, tiny buffers, nearly full disk.

Record the failure rate before and after; later verification compares against it.

## Analyzing without a repro

Sources: logs from all threads around the event (not only the last line), core dump or minidump, crash reporter, `journalctl -u <service>`, `dmesg` (OOM killer, segfault lines), metrics around the time, deploy and config history.

- **Timeline**: put every source on one clock and look for what always precedes the failure.
- **Compare occurrences**: what is common across them (code path, time of day, client, load) and what varies.
- **Segfault line without a core**: `segfault at <addr> ip <ip> ... in <binary>[<base>+<size>]` → offset = ip − base → `addr2line -f -C -e <binary-with-symbols> <offset>`.
- **Static reach analysis**: for the failing line, list every path that can reach it with the bad state; each path is a hypothesis.

## Mechanical search (no theory needed)

- **git bisect**: `git bisect start <bad> <good>` then `git bisect run <script>` (exit 0 good, 1 bad, 125 skip).
  For an intermittent bug, the script runs the repro enough times to tell good from bad.
- **Input bisection**: halve the failing input until it is minimal.
- **Config bisection**: reset half the settings to defaults, keep the half that still fails.
- **Differential analysis**: list every difference between a working and a failing setup (version, OS, libraries via `ldd`, config, env vars, data, hardware, load) and test them in halves.

## Cross-checking with tools

- **AddressSanitizer (ASan)**: heap-use-after-free, buffer overflow, double free.
- **ThreadSanitizer (TSan)**: data races.
- **UndefinedBehaviorSanitizer (UBSan)**: undefined behavior in general.
- **MemorySanitizer (MSan)**: reads of uninitialized memory.
- **Valgrind** (memcheck, helgrind): memory errors, lock-order problems, where a sanitizer build is impractical.
- **gdb/lldb on a core dump**: thread stacks and object state at the moment of the crash.
- **rr**: record a failing run once, then replay it deterministically, including backwards.

## Premise checklist

Refuted hypotheses often share a false premise. Check each explicitly:

- **Running artifact = source you read**: binary version or build id, symlink target, deployed commit.
- **Config actually loaded**: path in use, env or CLI overrides, the file the process really opened (`/proc/<pid>/cmdline`, `lsof -p <pid>`).
- **Scope**: which host, process, worker, and thread failed; whether multiple processes or replicas each hold their own copy of state.
- **Evidence freshness**: the log or dump is from the failing run; caches and build outputs are not stale.
- **"Unchanged" dependencies**: lockfile, system libraries, kernel, remote service versions.
