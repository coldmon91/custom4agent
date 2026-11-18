# Build Systems and Tooling

Toolchain: **CMake** for builds, **GoogleTest** for tests. Follow the repo's existing CMake,
`.clang-tidy`, and `.clang-format` before introducing new settings.

## Modern CMake

- Target-based: `target_compile_features(tgt PUBLIC cxx_std_20)`, `target_include_directories`,
  `target_link_libraries` — avoid global `include_directories` / `add_definitions`.
- Globals worth setting: `CMAKE_CXX_STANDARD_REQUIRED ON`, `CMAKE_CXX_EXTENSIONS OFF`,
  `CMAKE_EXPORT_COMPILE_COMMANDS ON` (required by clang-tidy / IWYU).
- Installable libs: `$<BUILD_INTERFACE:>` / `$<INSTALL_INTERFACE:>` include paths.

```cmake
if(MSVC)
    add_compile_options(/W4 /WX)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Werror)
endif()
```

## GoogleTest via FetchContent

```cmake
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG        v1.15.2   # pin a release tag, not a moving branch
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)  # Windows: consistent CRT
FetchContent_MakeAvailable(googletest)

include(GoogleTest)
add_executable(unit_tests test_foo.cpp)
target_link_libraries(unit_tests PRIVATE GTest::gtest_main GTest::gmock)
gtest_discover_tests(unit_tests)   # run with: ctest --test-dir build
```

- `EXPECT_*` continues, `ASSERT_*` stops the test; `TEST_P` + `INSTANTIATE_TEST_SUITE_P` for
  parameterized tests; `MOCK_METHOD(ret, name, (args), (override))` for GMock.

## Sanitizers

```cmake
# Select via -DCMAKE_BUILD_TYPE=ASAN|UBSAN|TSAN|MSAN
set(CMAKE_CXX_FLAGS_ASAN  "-g -O1 -fsanitize=address -fno-omit-frame-pointer"    CACHE STRING "")
set(CMAKE_CXX_FLAGS_UBSAN "-g -O1 -fsanitize=undefined -fno-omit-frame-pointer"  CACHE STRING "")
set(CMAKE_CXX_FLAGS_TSAN  "-g -O1 -fsanitize=thread -fno-omit-frame-pointer"     CACHE STRING "")
set(CMAKE_CXX_FLAGS_MSAN  "-g -O1 -fsanitize=memory -fno-omit-frame-pointer"     CACHE STRING "")
```

- ASan + UBSan combine; TSan is exclusive with ASan / MSan. MSan needs an instrumented libc++
  to avoid false positives.

## Static analysis

```bash
clang-tidy src/*.cpp -p build/                  # needs compile_commands.json
cppcheck --enable=all --std=c++20 --suppress=missingInclude src/
include-what-you-use -std=c++20 src/main.cpp
```
