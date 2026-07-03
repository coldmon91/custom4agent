# Java / Kotlin Checklist

Check for:
- Spring controllers, scheduled jobs, listeners, bean wiring
- interface / abstract class dispatch
- annotations that create entry points or handlers
- reflection / service loader / dependency injection

Useful search patterns:
- `@GetMapping`, `@PostMapping`, `@RequestMapping`, `@Scheduled`, `@EventListener`, `implements`, `extends`

## Error Control Flow

Check for:
- `try` / `catch` / `finally` branches
- whether exceptions escape to callers or are handled locally

Error-specific guidance:
- `finally` blocks still run before `return` or rethrow paths complete.
- Treat exception-only paths as reachable only when the triggering failure source is explained.

## Dynamic Loading and Generated Code

Check for:
- `ServiceLoader`, `Class.forName()`, reflection, annotation processors
- compile-time annotation processing versus runtime dispatch

Dynamic-specific guidance:
- Mark paths as low-confidence if the target is loaded by class name, reflection, or environment-dependent logic.
- Identify all possible targets if an implementation registry exists in project code.

## Conditional Compilation and Feature Flags

Check for:
- system properties and Spring profiles
- framework version assumptions in `pom.xml`, `build.gradle`, or lock files

Feature-flag guidance:
- Trace whether the flag source is external environment or internal code configuration.
- If the flag can change in a running system, mark timing as uncertain.
- Mark explicitly when analysis depends on framework version assumptions such as Spring Boot behavior.
