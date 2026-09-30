# Java / Kotlin

## Entry points and registration
- Spring: `@GetMapping`, `@PostMapping`, `@RequestMapping`, `@Scheduled`, `@EventListener`, bean wiring
- Annotations that create handlers or entry points
- Interface / abstract class dispatch: `implements`, `extends`

## Path-specific patterns
- Dynamic: `ServiceLoader`, `Class.forName()`, reflection, dependency injection: low confidence. If the project has an implementation registry, list every registered target.
- Separate compile-time annotation processing from runtime dispatch.
- Flags: system properties, Spring profiles. Framework versions live in `pom.xml`, `build.gradle`, or lock files.
