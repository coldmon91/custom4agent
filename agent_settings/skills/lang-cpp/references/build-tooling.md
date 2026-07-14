# Build Systems and Tooling

Scoped to the toolchain in use: **CMake** for builds and **GoogleTest** for tests.
Keyword-directed guidance for the parts an agent already knows (CMake target shape,
test-framework macros). Exact flags, configs, and invocations are kept **literal** —
their value is the precise string, which a keyword cannot reconstruct.

## Modern CMake (keywords)

- `cmake_minimum_required(VERSION 3.20)`; set standard via **target** feature, not global
  when possible: `target_compile_features(tgt PUBLIC cxx_std_20)`.
- Globals worth setting: `CMAKE_CXX_STANDARD_REQUIRED ON`, `CMAKE_CXX_EXTENSIONS OFF`,
  `CMAKE_EXPORT_COMPILE_COMMANDS ON` (required by clang-tidy / IWYU).
- `target_include_directories` with `$<BUILD_INTERFACE:>` / `$<INSTALL_INTERFACE:>` for
  installable libs. Pull in-tree dependencies (incl. GoogleTest) with `FetchContent`.
- Warnings (keep literal — the exact set matters):

```cmake
if(MSVC)
    add_compile_options(/W4 /WX)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Werror)
endif()
```

## Dependencies via FetchContent (literal — GoogleTest)

```cmake
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.15.2   # pin a release tag, not a moving branch
)
# Windows: keep the runtime consistent with the rest of the build
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)
```

## Sanitizers (literal — exact flags)

```cmake
# Select via -DCMAKE_BUILD_TYPE=ASAN|UBSAN|TSAN|MSAN
set(CMAKE_CXX_FLAGS_ASAN  "-g -O1 -fsanitize=address -fno-omit-frame-pointer"    CACHE STRING "")
set(CMAKE_CXX_FLAGS_UBSAN "-g -O1 -fsanitize=undefined -fno-omit-frame-pointer"  CACHE STRING "")
set(CMAKE_CXX_FLAGS_TSAN  "-g -O1 -fsanitize=thread -fno-omit-frame-pointer"     CACHE STRING "")
set(CMAKE_CXX_FLAGS_MSAN  "-g -O1 -fsanitize=memory -fno-omit-frame-pointer"     CACHE STRING "")
```

- ASan+UBSan can combine; TSan and ASan/MSan are mutually exclusive. MSan needs an
  instrumented libc++ to avoid false positives.

## Static Analysis (literal — config + commands)

```yaml
# .clang-tidy
Checks: >
  *, -fuchsia-*, -google-*, -llvm-*,
  -modernize-use-trailing-return-type, -readability-identifier-length
WarningsAsErrors: '*'
CheckOptions:
  - { key: readability-identifier-naming.ClassCase,    value: CamelCase }
  - { key: readability-identifier-naming.FunctionCase, value: lower_case }
  - { key: readability-identifier-naming.VariableCase, value: lower_case }
  - { key: readability-identifier-naming.ConstantCase, value: UPPER_CASE }
  - { key: readability-identifier-naming.MemberCase,   value: lower_case }
  - { key: readability-identifier-naming.MemberSuffix, value: '_' }
```

```bash
clang-tidy src/*.cpp -p build/                                   # needs compile_commands.json
cppcheck --enable=all --std=c++20 --suppress=missingInclude src/
include-what-you-use -std=c++20 src/main.cpp
```

## Testing with GoogleTest (keywords)

- `TEST(Suite, Name)` for free tests, `TEST_F(Fixture, Name)` for fixtures,
  `TEST_P(Fixture, Name)` + `INSTANTIATE_TEST_SUITE_P` for parameterized tests.
- Assertions: `EXPECT_EQ` / `ASSERT_EQ` (fatal vs non-fatal), `EXPECT_THROW`,
  `EXPECT_THAT(value, matcher)` + `::testing::` matchers, `EXPECT_NEAR(a, b, abs_err)`.
- GMock: `MOCK_METHOD(ret, name, (args), (override))` +
  `EXPECT_CALL(mock, name(...)).WillOnce(Return(...))`.
- Wire tests to CTest via `gtest_discover_tests(test_target)` (from `include(GoogleTest)`),
  then run `ctest --test-dir build`.

```cmake
include(GoogleTest)
add_executable(unit_tests test_foo.cpp)
target_link_libraries(unit_tests PRIVATE GTest::gtest_main GTest::gmock)
gtest_discover_tests(unit_tests)
```

## Profiling (literal — commands)

```bash
perf record -g ./myapp && perf report        # Linux
valgrind --tool=callgrind ./myapp            # call graph -> kcachegrind
valgrind --tool=massif ./myapp               # heap -> ms_print
instruments -t "Time Profiler" ./myapp       # macOS
```

## CI (keywords)

- GitHub Actions: matrix over `{os, compiler, build_type}`; separate jobs for
  `{asan, ubsan, tsan}` sanitizer builds and a static-analysis job (clang-tidy + cppcheck
  with `--error-exitcode=1`).
- `FetchContent` needs no extra CI setup — dependencies resolve at configure time; cache
  the CMake build/deps directory to keep runs fast.

## Quick Reference

| Tool | Purpose | Command |
|------|---------|---------|
| CMake | Build system | `cmake -B build && cmake --build build` |
| CTest | Test runner | `ctest --test-dir build` |
| FetchContent | Dependency fetch | `FetchContent_MakeAvailable(googletest)` |
| ASan | Memory errors | `-fsanitize=address` |
| UBSan | Undefined behavior | `-fsanitize=undefined` |
| TSan | Data races | `-fsanitize=thread` |
| clang-tidy | Static analysis | `clang-tidy src/*.cpp` |
| cppcheck | Static analysis | `cppcheck --enable=all src/` |
| GoogleTest | Unit testing | `TEST(Suite, Name) { EXPECT_EQ(...); }` |
| GMock | Mocking | `MOCK_METHOD(ret, name, (args), (override))` |
| Valgrind | Memory profiler | `valgrind --tool=memcheck ./app` |
