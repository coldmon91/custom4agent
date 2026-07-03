---
name: xcode-project
description: Manage Xcode project infrastructure — XcodeGen (project.yml), code signing, xcconfig files, build settings, and simulator/device build commands. Use when the user reports "Signing for X requires a development team", says signing settings get reset every time, asks to set up XcodeGen, regenerates project.pbxproj, sets up xcconfig, configures DEVELOPMENT_TEAM, or runs xcodebuild for an Xcode project. Distinct from lang-swift (Swift code/SwiftUI/concurrency); this skill owns the project file, build configuration, and toolchain.
---

# Xcode Project

Project-infrastructure skill for Xcode iOS/macOS apps. Owns the project file
(`project.pbxproj`/`project.yml`), build settings, code signing, xcconfig, and
the `xcodebuild` command line. Code-level concerns (Swift, SwiftUI, actors,
async/await) belong to `lang-swift`, not here.

## When to Use

Trigger on any of:

- Build error `Signing for "X" requires a development team. Select a development team in the Signing & Capabilities editor.`
- User reports that Xcode UI signing config is wiped every time they regenerate
- Setting up or modifying `project.yml` (XcodeGen)
- Adding/managing xcconfig files
- Configuring `DEVELOPMENT_TEAM`, `CODE_SIGN_STYLE`, entitlements, app groups
- Running `xcodebuild` from terminal (build, test, archive, showBuildSettings)
- Picking simulator destinations, dealing with `iphoneos` vs `iphonesimulator`
- Investigating why a build setting isn't taking effect

Do NOT use for: Swift language questions, SwiftUI layout, async/await design,
runtime crashes inside app code — those go to `lang-swift` or
`bug-hunter`/`crash-analytics`.

## Core Diagnostic: Why Signing Settings Keep Disappearing

**Single most common cause**: the project uses XcodeGen, but `project.yml` does
not specify signing. Whenever `xcodegen generate` runs (manually, in a hook,
or in CI), `project.pbxproj` is rewritten from `project.yml` and any
`DEVELOPMENT_TEAM` set via the Xcode UI is wiped.

Confirm with:

```bash
which xcodegen                                  # is XcodeGen even installed?
ls project.yml 2>/dev/null                      # is this an XcodeGen project?
rg -n "DEVELOPMENT_TEAM|CODE_SIGN_STYLE" project.yml
rg -n "DEVELOPMENT_TEAM" *.xcodeproj/project.pbxproj | head -5
```

If `xcodegen` is installed and `project.yml` exists but has no
`DEVELOPMENT_TEAM`, that's the root cause.

## Fix: Persist Signing via xcconfig (Recommended)

Keep the team ID out of the committed `project.yml` and out of
`project.pbxproj`. Use a gitignored xcconfig file and reference it from
`project.yml`. After this, `xcodegen generate` is safe to run.

### Step 1 — extract the developer's Team ID

```bash
security find-certificate -c "Apple Development" -p \
  | openssl x509 -noout -subject
```

The 10-character string in the `OU=` field is the Team ID (e.g.
`OU=NZA342V794`). If multiple certificates exist, narrow the `-c` query to a
specific name.

### Step 2 — create the xcconfig pair

`Configs/Signing.xcconfig` (gitignored, real values):

```
// Local signing config — DO NOT COMMIT
DEVELOPMENT_TEAM = NZA342V794
CODE_SIGN_STYLE = Automatic
```

`Configs/Signing.xcconfig.template` (committed, placeholder for other devs):

```
// Copy to Configs/Signing.xcconfig and fill in your Team ID.
// Find it with: security find-certificate -c "Apple Development" -p \
//   | openssl x509 -noout -subject
DEVELOPMENT_TEAM = YOUR_TEAM_ID_HERE
CODE_SIGN_STYLE = Automatic
```

### Step 3 — gitignore the local file

Add to `.gitignore`:

```
# Local signing config (per-developer team ID lives here)
Configs/Signing.xcconfig
```

### Step 4 — wire into project.yml

Add at the top level of `project.yml` (applies to all targets, all configs):

```yaml
configFiles:
  Debug: Configs/Signing.xcconfig
  Release: Configs/Signing.xcconfig
```

Place this as a sibling of `name`, `options`, `settings`, `targets`. Per-target
overrides can also use `configFiles:` inside a target block.

### Step 5 — regenerate and verify

```bash
xcodegen generate
xcodebuild -project YourApp.xcodeproj -scheme YourApp \
  -destination 'platform=iOS Simulator,name=iPhone 17,arch=arm64' \
  -configuration Debug -showBuildSettings \
  | rg -i "DEVELOPMENT_TEAM|CODE_SIGN_STYLE"
```

Each buildable target should show the team ID and `Automatic`. If a target is
missing, it likely has its own `settings:` block in `project.yml` that omits a
`configFiles:` entry — add one at that target level too.

## Alternative: Inline in project.yml

Acceptable for solo personal projects where the team ID isn't sensitive:

```yaml
settings:
  base:
    DEVELOPMENT_TEAM: NZA342V794
    CODE_SIGN_STYLE: Automatic
```

Simpler, but the Team ID is committed to git. For shared repos prefer the
xcconfig approach.

## Build Commands Cheat Sheet

Always quote destinations and pass `-project` (or `-workspace`) explicitly so
the command is reproducible.

```bash
# List schemes/targets
xcodebuild -list -project YourApp.xcodeproj

# Available simulators
xcrun simctl list devices available | rg -i iphone

# Build for simulator (no device signing required)
xcodebuild -project YourApp.xcodeproj -scheme YourApp \
  -destination 'platform=iOS Simulator,name=iPhone 17,arch=arm64' \
  -configuration Debug build

# Run tests
xcodebuild -project YourApp.xcodeproj -scheme YourApp \
  -destination 'platform=iOS Simulator,name=iPhone 17,arch=arm64' \
  test

# Inspect resolved build settings (debugging "why isn't my flag applied?")
xcodebuild ... -showBuildSettings | rg -i "FLAG_NAME"
```

Wrap long invocations with `gtimeout 240` to avoid orphaned hangs:

```bash
gtimeout 240 xcodebuild ... 2>&1 | tail -60
```

## Simulator-Only Builds Without Signing

If a project must build on a machine that has no developer cert at all (CI
sandbox, fresh checkout), simulator builds can skip signing entirely:

```bash
xcodebuild ... build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

Don't use this for device or archive builds — those genuinely need a signed
identity. And don't add it to `project.yml`; keep it in the command line so
real builds still validate signing.

## When `project.yml` Targets Diverge

XcodeGen merges `configFiles` from project level into every target. But if a
target sets its own `configFiles:` block, that *replaces* the inherited one.
Symptom: most targets pick up the team ID, one specific target doesn't.

Fix: add the same `configFiles:` block inside the offending target, or remove
the per-target override.

## Diagnostic Checklist

When the user reports a signing or build-settings problem, walk through:

1. Is this an XcodeGen project? (`ls project.yml`)
2. Is xcodegen installed and on PATH? (`which xcodegen`)
3. Does `project.yml` declare signing? (`rg DEVELOPMENT_TEAM project.yml`)
4. Does `project.pbxproj` have it after generation? (`rg DEVELOPMENT_TEAM *.xcodeproj/project.pbxproj`)
5. Does `xcodebuild -showBuildSettings` resolve it for every buildable target?

Each "no" pinpoints which step in the chain to fix. Don't skip ahead to step 5
without confirming 1–4.

## Common Pitfalls

- **Editing `project.pbxproj` directly** in an XcodeGen project: changes vanish
  on next `xcodegen generate`. Always edit `project.yml` instead.
- **Putting `DEVELOPMENT_TEAM` in `project.yml` for a public repo**: leaks the
  team ID. Use xcconfig + gitignore.
- **Forgetting to add `Configs/Signing.xcconfig` to `.gitignore`** before the
  first commit: the secret is now in git history. Rewrite history or rotate.
- **Mixing `CODE_SIGN_STYLE = Manual`** with `Automatic` across targets: pick
  one consistently. Automatic is right for development; Manual is right for
  CI/distribution where you provide a specific provisioning profile.
- **Test bundles missing the inherited xcconfig**: in-project `configFiles`
  cascades to all targets, but only if those targets don't override
  `configFiles` themselves.

## Out of Scope

- Swift code, SwiftUI, async/await, actors → `lang-swift`
- Crash analysis, crash rate, Crashlytics → `crash-analytics`
- App Store submission, TestFlight, distribution provisioning profiles —
  not currently covered; ask the user whether to extend this skill or use Apple's
  current docs
