# C / C++ Checklist

Check for:
- `main`
- function pointers and callback tables
- virtual dispatch and inheritance
- macro guards and compile-time flags
- registration tables, factories, plugin systems
- signal handlers, thread entry functions
- constructor attributes / static initialization

Useful search patterns:
- `main(`, `(*`, `std::function`, `virtual`, `override`, `#ifdef`, `#if`, `REGISTER_`, `factory`, `signal(`, `pthread_create`

## Error Control Flow

Check for:
- `try` / `catch` branches and exception propagation

Error-specific guidance:
- Treat exception-only paths as reachable only when the throw source is explained.

## Dynamic Loading and Generated Code

Check for:
- macro expansion that materially changes control flow

Dynamic-specific guidance:
- Expand important macros before concluding reachability.

## Conditional Compilation and Feature Flags

Check for:
- `#ifdef`, `#if`, `#else` preprocessor directives
- `std::enable_if` and SFINAE (Substitution Failure Is Not An Error)

Feature-flag guidance:
- Determine active configurations from build files and compiler definitions.
- Mark paths as conditionally reachable if a feature or preprocessor symbol must be enabled.

## Unused Code Detection (C/C++)

### Required tools

```bash
# 1. cppcheck (static analysis — most portable)
sudo apt install cppcheck      # Linux
brew install cppcheck           # macOS

# 2. Compiler warnings (GCC / Clang)
# Add to build flags: -Wunused-function -Wunused-variable -Wunused-parameter

# 3. clang-tidy (more precise, requires compile_commands.json)
sudo apt install clang-tidy
```

C/C++ analysis is the most complex due to header files, translation units, and linker symbol visibility. Use `cppcheck` combined with compiler warnings for best coverage.

### Running the tools

cppcheck:

```bash
# Basic run
cppcheck --enable=unusedFunction --enable=style \
         --suppress=missingIncludeSystem \
         --error-exitcode=0 \
         -j4 \
         src/

# Explicit C++ mode
cppcheck --enable=unusedFunction \
         --language=c++ \
         src/

# XML output (easier to parse)
cppcheck --enable=unusedFunction \
         --xml --xml-version=2 \
         src/ 2>cppcheck_report.xml

# Parse XML output
cat cppcheck_report.xml | grep 'id="unusedFunction"'
```

GCC compiler warnings:

```bash
# Add flags at compile time
gcc -Wunused-function \
    -Wunused-variable \
    -Wunused-parameter \
    -Wunused-but-set-variable \
    -Wall -Wextra \
    -c src/*.c 2>&1 | grep "warning:.*unused\|warning:.*declared but never used"

# For CMake projects
cmake -DCMAKE_C_FLAGS="-Wunused-function -Wunused-variable" \
      -DCMAKE_CXX_FLAGS="-Wunused-function -Wunused-variable" \
      ..
make 2>&1 | grep "warning:.*unused"
```

Clang warnings:

```bash
clang -Wunused -Wunused-function -Wunused-variable \
      -fno-caret-diagnostics \
      src/*.c 2>&1 | grep "warning:.*unused"
```

### Entry points

```bash
# main function
grep -rn "^int main\|^void main" --include="*.c" --include="*.cpp" .

# Header-declared functions (externally linkable)
grep -rn "^[a-zA-Z].*(.*);" --include="*.h" --include="*.hpp" .

# Constructor attribute (runs at program startup)
grep -rn "__attribute__.*constructor" --include="*.c" --include="*.cpp" .

# Dynamic library exports (visibility)
grep -rn "__attribute__.*visibility.*default\|__declspec(dllexport)" \
    --include="*.c" --include="*.cpp" --include="*.h" .

# Linker scripts
ls *.ld *.lds linker.script 2>/dev/null
```

Functions declared in headers must always be classified as UNKNOWN. If a linker script contains `KEEP` sections, related symbols are also UNKNOWN.

### Edge cases → classify as UNKNOWN

**1. Functions declared in header files**
```bash
grep -rn "^[a-zA-Z_]" --include="*.h" --include="*.hpp" .
```
- `library_mode=yes` → UNKNOWN (may be linked by external projects)
- `library_mode=no` → check for references within this repository only; if no internal references exist, treat as UNUSED candidate (still subject to other edge-case checks)

**2. `__attribute__` specifiers**
```bash
grep -rn "__attribute__" --include="*.c" --include="*.cpp" --include="*.h" .
```
- `__attribute__((used))` — compiler forced to keep it
- `__attribute__((weak))` — can be overridden at link time
- `__attribute__((alias(...)))` — aliased under another name

All of the above → UNKNOWN.

**3. Function pointer tables**
```bash
grep -rn "typedef.*(\*.*)()\|void \*\[\]\|struct.*{.*func" \
    --include="*.c" --include="*.cpp" --include="*.h" .
```
If a function pointer array or struct exists → functions whose signatures match the pointer type are UNKNOWN.

**4. `dlopen` / `dlsym` dynamic loading**
```bash
grep -rn "dlopen\|dlsym\|GetProcAddress\|LoadLibrary" \
    --include="*.c" --include="*.cpp" .
```
Symbols loaded by name at runtime → all symbols in that library are UNKNOWN.

**5. Inline assembly**
```bash
grep -rn "__asm__\|asm(" --include="*.c" --include="*.cpp" .
```
Assembly can call functions by symbol name directly → symbols in the same file are UNKNOWN.

**6. `#ifdef` / `#if` conditional compilation**
```bash
grep -rn "#ifdef\|#if defined\|#if " --include="*.c" --include="*.cpp" --include="*.h" .
```
Code compiled only under certain macro conditions → UNKNOWN.

**7. Forward declarations without a visible definition**
Translation units may have symbols that look undefined locally but are resolved at link time. Cross-translation-unit references cannot be fully tracked by static analysis alone → UNKNOWN.

**8. Callback registration patterns**
```bash
grep -rn "register.*callback\|set_handler\|on_event\|signal(" \
    --include="*.c" --include="*.cpp" .
```
Functions passed as callbacks → UNKNOWN.

**9. `extern` declarations**
```bash
grep -rn "^extern " --include="*.c" --include="*.cpp" --include="*.h" .
```
`extern` brings in a definition from another translation unit → the original symbol is UNKNOWN.

### `static` vs non-`static` functions

cppcheck analyzes one translation unit at a time. A non-`static` function called from another `.c` file may still appear as "unused".

Rule:
- `static` function reported as unused → UNUSED candidate (file-scoped, no external linkage)
- Non-`static` function reported as unused → **always UNKNOWN** (may be called from another translation unit)

```bash
# Filter to static functions only for higher-confidence results
cppcheck --enable=unusedFunction src/ 2>&1 | grep "unused function" | while read line; do
  func=$(echo "$line" | grep -oP "'\K[^']+")
  grep -rn "^static.*$func" src/ && echo "UNUSED candidate: $func"
done
```

### Exclusion patterns

```bash
cppcheck --exclude=vendor \
         --exclude=third_party \
         --exclude=external \
         --exclude=build \
         src/

# Generated file patterns to exclude manually
# *.pb.c *.pb.cc *.pb.h    — protobuf
# moc_*.cpp                 — Qt MOC
# ui_*.h                    — Qt UI
# *.generated.c *.generated.h
```
