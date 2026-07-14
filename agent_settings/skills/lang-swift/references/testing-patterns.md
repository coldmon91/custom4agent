# Testing Patterns

## Framework choice: XCTest vs Swift Testing
- Swift Testing (Xcode 16 / iOS 18, Swift 6) — new default for unit tests. `@Test` funcs (free functions or in a `struct`), `#expect(...)` (soft, keeps going) and `#require(...)` (throws/stops on failure). Parameterized via `@Test(arguments:)`. `#expect(throws:)` for errors. Uses `Suite`/`struct` with fresh instance per test — no shared mutable state, better parallelism.
- XCTest — still required for UI tests (`XCUIApplication`) and performance tests (`measure`); use for pre-Xcode-16 / older deployment. Class subclasses `XCTestCase`, `XCTAssert*`, `setUp`/`tearDown`.
- Directive: new unit tests → Swift Testing on Xcode 16+; keep XCTest for UI/perf and legacy suites. The two can coexist in one target.

## XCTest essentials (literal APIs)
- `@testable import MyApp` — access internal symbols.
- Lifecycle: `override func setUp()` / `tearDown()` (call `super`). `setUp() async throws` variant for async setup.
- Assertions: `XCTAssertEqual`, `XCTAssertNil`/`NotNil`, `XCTAssertTrue`/`False`.
- `try XCTUnwrap(optional)` — fail-and-stop unwrap instead of force-unwrap in tests.

## Async testing
- `func testX() async throws` — await the code directly; no expectations needed for simple async.
- `XCTestExpectation` + `await fulfillment(of:timeout:)` — only for callback/delegate/Notification APIs you can't `await`. In Swift Testing use `confirmation { }` instead.
- `async let` in tests to exercise concurrent paths. Consume `AsyncSequence` with `for try await` + `break`.
- Gotcha: no built-in per-test timeout for `async`; a hung `await` hangs the test. Wrap in a task-group timeout helper (spawn work + a `Task.sleep` racer) if the operation can stall.

## Mocking / test doubles
- Depend on a `protocol`, inject the real impl in prod and a double in tests — the core testability lever.
- Mock — records calls + flags (`fetchCalled`, captured args) and returns configured results/errors; assert on interactions.
- Stub — returns canned responses (e.g. a `Result` property).
- Spy — records interactions on a real-ish object (delegate call counts).
- Fake — lightweight working impl (in-memory dict as a DB).
- Directive: pick by intent — verifying interactions → mock/spy; supplying inputs → stub/fake.

## Performance testing (XCTest only)
- `measure { }` — baseline timing. `measure(metrics:options:)` with `XCTClockMetric`, `XCTCPUMetric`, `XCTMemoryMetric`, `XCTStorageMetric`; `XCTMeasureOptions().iterationCount`.

## UI testing (XCTest only)
- `XCUIApplication().launch()` in `setUp`; set `continueAfterFailure = false`.
- Query by accessibility id: `app.textFields["Email"]`, `app.secureTextFields[...]`, `app.buttons[...]`; `.tap()`, `.typeText(_)`, assert `.exists` / `.isEnabled`.

## Actors & snapshot
- Test actor isolation by hammering with a `withTaskGroup` of concurrent `await`s, then assert the final serialized value.
- Snapshot testing needs the third-party `SnapshotTesting` package: `assertSnapshot(matching:as:)` with `.image`, `.image(on: .iPhone13)`, or `.image(traits:)` for dark mode.

## xcodebuild test invocations (KEEP literal)
```bash
# Run all tests on a simulator
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest'

# Run a specific test (Swift Testing or XCTest): Target/Suite-or-Class/method
xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -only-testing:MyAppTests/UserTests/testUserCreation

# SwiftPM package tests
swift test
swift test --filter UserTests
```

## Best Practices
- `@testable import` for internals; one concept per test; Given-When-Then.
- Name `test_method_condition_expectedResult`.
- Inject via protocols; test edge/error cases; keep tests fast and independent.
- New unit tests on Xcode 16+ → Swift Testing (`@Test`/`#expect`); XCTest for UI/perf.
