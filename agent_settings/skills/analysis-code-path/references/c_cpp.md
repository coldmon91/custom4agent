# C / C++

## Entry points and registration
- `main(`
- Threads and signals: `pthread_create(`, `std::thread(`, `signal(`, `sigaction(`
- Startup code: `__attribute__((constructor))`, static initialization
- Registration tables, factories, plugins: `REGISTER_`, `factory`, `create(`
- Function pointers and callbacks: `(*name)(`, `std::function`, callback tables
- Virtual dispatch: `virtual`, `override`

## Path-specific patterns
- Exceptions: `try` / `catch`. An exception-only path is reachable only when the throw source is explained.
- Macros: expand control-flow-changing macros before concluding (`cc -E`).
- Conditional compilation: `#if`, `#ifdef`, `#else`, `std::enable_if` / SFINAE. Determine active definitions from build files (CMake, Makefile) and `-D` flags.

## Unused code: cppcheck + compiler warnings

```bash
brew install cppcheck   # or: apt install cppcheck
# unusedFunction is whole-program: run without -j, or add --cppcheck-build-dir=<dir> with -j
cppcheck --enable=unusedFunction --quiet --suppress=missingIncludeSystem \
  -i vendor -i third_party -i external -i build <scope>
```

- Output line: `b.c:2:5: style: The function 'foo' is never used. [unusedFunction]`
- Compiler hints: `cc -fsyntax-only -Wall -Wextra <files>` (includes `-Wunused-function`, `-Wunused-variable`, `-Wunused-but-set-variable`). `-Wunused-function` covers `static` functions only.
- A `static` function reported unused is an `UNUSED` candidate (internal linkage).
- A non-`static` function reported unused is `UNKNOWN` when `library_mode=yes` or when the scope misses translation units that link it. Otherwise confirm with `rg` that no other file references it; then it is an `UNUSED` candidate, subject to the rules below.

### Edge cases: `UNKNOWN`
- `__attribute__((used))`, `((weak))`, `((alias(...)))`
- Exported: `__attribute__((visibility("default")))`, `__declspec(dllexport)`
- Signature matches a function-pointer type or a callback table entry
- Loaded through `dlopen` / `dlsym` / `GetProcAddress` / `LoadLibrary`
- Same file contains inline assembly (`__asm__`, `asm(`)
- Inside `#if` / `#ifdef`
- Resolved only at link time (`extern`, forward declarations), or kept by a linker script `KEEP` section
- Registered as a callback (`signal(`, `set_handler`, `register*callback`)

```bash
rg -n '__attribute__|__declspec|dlopen|dlsym|GetProcAddress|LoadLibrary|__asm__|asm\(|^extern |#if' \
  -g '*.{c,cc,cpp,cxx,h,hh,hpp}' <scope>
```

Exclude generated files: `*.pb.c`, `*.pb.cc`, `*.pb.h`, `moc_*.cpp`, `ui_*.h`, `*.generated.c`, `*.generated.h`.
