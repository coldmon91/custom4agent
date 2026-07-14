---
name: analysis-program
description: Comprehensively analyzes an existing program's features, structure, operational characteristics, protocols, and risks based on 12 core categories. Uses a parallel specialist agent structure, and prefers codegraph and Serena MCP when they are active (optional; works without them).
---

# Parallel Program Comprehensive Analysis Skill

## 1. Purpose

This skill comprehensively analyzes an existing program's features, structure, operational characteristics, protocols, and risks.

Multiple specialist agents analyze in parallel; a coordinator merges the results. `codegraph` and `Serena MCP` are optional and auto-detected at the start — prefer them when active (see §3).

The final report uses these 12 core categories:

1. Scope & Documentation
2. Architecture & Components
3. Runtime Lifecycle
4. Feature Inventory
5. Interfaces & Protocols
6. Data Flow & State
7. Configuration & Environment
8. Security & Reliability
9. Operations & Observability
10. Testing & Coverage
11. Build & Deployment
12. Compatibility & Limitations

Depending on project nature, expand the `Protocols`, `Deployment`, `Security`, and `Coverage` sections in more detail.

---

## 2. Core Principles

### Evidence

- Base every conclusion on code evidence; never assert without it.
- Mark assumptions as `추정`, unverified items as `확인 불가`.
- Do not determine a role from a name or filename alone (including security features).
- Do not assume protocol endianness, checksum/CRC algorithm, encryption method, or config default values without code evidence.

### Separation

- Separate documentation-only, test-only, and actual runtime features; never conflate them.
- Do not assert runtime features or behavior from README, docs, or test code alone.
- Do not confuse generated code with runtime code.
- Do not assert a documented feature as completed, nor dead code as an active feature.

### Process & output

- Do not modify code during analysis.
- Write the final report in Korean, using tables actively.
- Include all 12 categories; even if one does not apply, do not omit it — mark it `해당 없음` or `코드상 확인 불가`.
- Even when the analysis is vast, do not merely summarize.

---

## 3. Tool Roles

`codegraph` and `Serena MCP` are optional. At the start of analysis, auto-detect whether they are active and prefer them when so. Analysis proceeds even when inactive; this skill defines no separate fallback guide for that case.

### 3.1 Serena MCP (optional)

When active, prefer it for symbol-level code navigation: project activation, onboarding, directory listing, file reading, symbol overview, symbol definition/reference lookup, pattern search, memory storage.

Recommended tools:

```text
activate_project
check_onboarding_performed
onboarding
list_dir
find_file
read_file
get_symbols_overview
find_symbol
find_referencing_symbols
search_for_pattern
write_memory
```

### 3.2 codegraph (optional)

When active, prefer it for structural relationship analysis: whole-codebase indexing, caller/callee/call-chain analysis, module dependency, class/struct relationships, API route→handler links, parser→dispatcher flow, encoder→send/write flow, dead code candidate detection.

---

## 4. Input Format

The analysis agent may receive the following input.

```yaml
target_project_path: "<project root to analyze>"
entrypoints:
  - "<service main file or executable binary>"
  - "<server startup script>"
output_language: "ko"
analysis_depth: "deep"
parallel: true
include_bit_level_protocol: true
include_security_review: true
include_testing_coverage: true
include_build_deployment: true
protocol_keywords:
  - packet
  - frame
  - message
  - opcode
  - command
  - payload
  - header
  - crc
  - checksum
  - serialize
  - deserialize
  - encode
  - decode
```

If entrypoints are not specified, the coordinator must find candidates.

---

## 5. Parallel Agent Composition

```yaml
agents:
  coordinator:
    role: "Overall analysis planning, task distribution, merging, conflict resolution"

  documentation_scope_agent:
    role: "Document map, project purpose, system boundary, stale document analysis"

  architecture_component_agent:
    role: "Module structure, key objects, component responsibility analysis"

  runtime_lifecycle_agent:
    role: "Startup, shutdown, initialization, loop, signal, shutdown analysis"

  feature_inventory_agent:
    role: "Feature list, active/inactive features, dormant/dead code analysis"

  interface_protocol_agent:
    role: "API, route, CLI, inbound/outbound, protocol analysis"

  dataflow_state_agent:
    role: "Processing flow, state transition, session, cache, DB, lock analysis"

  config_environment_agent:
    role: "Config files, environment variables, options, defaults, loading priority analysis"

  security_reliability_agent:
    role: "Authentication, authorization, secret, validation, error, retry, timeout analysis"

  operations_observability_agent:
    role: "Log, metrics, health check, file management, cleanup analysis"

  testing_coverage_agent:
    role: "Test structure, coverage gap, mock/stub, unreachable code analysis"

  build_deployment_agent:
    role: "Build, packaging, container, deployment, runtime dependency analysis"

  compatibility_limitation_agent:
    role: "Compatibility, mode branching, feature flag, constraints and risk analysis"

  validation_agent:
    role: "Omission verification, evidence verification, conflict resolution"
```

---

## 6. Parallel Execution Phases

### 6.1 Phase 0. Coordinator Initialization

The coordinator performs the following first.

```markdown
1. Confirm the project root
2. If Serena MCP is active, perform project activation and onboarding
3. If codegraph is active, create or refresh the index
4. Review the file tree
5. Identify entrypoint candidates
6. Identify config file candidates
7. Identify documentation file candidates
8. Distribute tasks per specialist agent
```

The deliverable follows this format.

```markdown
## Analysis Task Distribution Table

| Agent | Scope | Key search terms | Expected deliverable |
|---|---|---|---|
```

### 6.2 Phase 1. Base Structure Analysis

```yaml
parallel_group_1:
  - documentation_scope_agent
  - architecture_component_agent
  - config_environment_agent
  - build_deployment_agent
```

Phase 1 first establishes the project's boundary and structure. These results are passed to Phase 2 agents.

### 6.3 Phase 2. Behavior and Interface Analysis

```yaml
parallel_group_2:
  - runtime_lifecycle_agent
  - feature_inventory_agent
  - interface_protocol_agent
  - dataflow_state_agent
```

Phase 2 analyzes actual execution flow and features, focusing on API, route, CLI, packet, loop, and state transition.

### 6.4 Phase 3. Quality and Operations Analysis

```yaml
parallel_group_3:
  - security_reliability_agent
  - operations_observability_agent
  - testing_coverage_agent
  - compatibility_limitation_agent
```

Phase 3 analyzes operability, stability, testing, and risk.

### 6.5 Phase 4. Merge and Validation

```yaml
parallel_group_4:
  - validation_agent
```

The coordinator merges all agent results. The validation agent verifies omissions and conflicts.

---

## 7. Per-Agent Analysis Instructions

Each agent covers one category (see §5) and follows the same contract:

- Search the codebase for its **search terms** (prefer codegraph/Serena MCP when active).
- Fill in the **deliverable** tables below.
- Attach evidence to every row (see §11); mark gaps as `확인 불가` / `추정`.

Below, each agent lists only its search terms and deliverable.

### 7.1 documentation_scope_agent — Scope & Documentation

Search terms: `README, docs, documentation, overview, guide, architecture, design, protocol, api, deployment, config, changelog, roadmap`

Deliverable:

```markdown
## Scope & Documentation

### Document List

| Document | Role | Read order | Related docs | Stale candidate | Evidence |
|---|---|---:|---|---|---|

### Project Scope

| Item | Content | Evidence |
|---|---|---|
| Project purpose |  |  |
| Primary users |  |  |
| System boundary |  |  |
| Provided feature scope |  |  |
| Out of scope |  |  |
```

### 7.2 architecture_component_agent — Architecture & Components

Search terms: `class, struct, interface, type, module, component, service, manager, controller, handler, repository, store, registry, factory, provider, client, server, session, context, state, model, entity`

Deliverable:

```markdown
## Architecture & Components

### Module Structure

| Module | Role | Key files | Dependent modules | Evidence |
|---|---|---|---|---|

### Role and Function List of Key Objects

| ID | Object name | Kind | File | Main role | Key methods/functions | Created at | Used at | Holds state | Evidence |
|---|---|---|---|---|---|---|---|---|---|

### Function Detail Per Key Object

| Object | Function | Method/function | Input | Output | Side effects | Evidence |
|---|---|---|---|---|---|---|

### Architecture Diagram (ASCII)

Express component relationships and data flow as ASCII art.

Rules:

- Use box-drawing characters: `+---+`, `|   |`
- Show data flow with arrows: `-->`, `<--`, `<-->`
- Label every arrow with what flows
- Include external systems (DB, MQ, API, file storage)
- Keep 80 ~ 100 column width
- Add a legend if symbols are not self-evident
- Every component in the diagram must appear in the body text
- Every service described in the body must appear in the diagram

Example style:

+------------------+    HTTP/JSON     +------------------+
|   API Gateway    | --------------> |   Auth Service   |
|                  | <-------------- |                  |
+------------------+   JWT Token     +------------------+
        |                                     |
        | gRPC                                | SQL
        v                                     v
+------------------+   events        +------------------+
|  Order Service   | --------------> |   PostgreSQL     |
+------------------+                 +------------------+
```

### 7.3 runtime_lifecycle_agent — Runtime Lifecycle

Search terms: `main, entrypoint, bootstrap, init, start, run, serve, listen, bind, loop, scheduler, worker, thread, spawn, signal, SIGINT, SIGTERM, shutdown, close, cleanup, dispose, destroy`

Deliverable:

```markdown
## Runtime Lifecycle

### Service Startup Behavior

| Order | Action | Function | Config condition | Side effects | Evidence |
|---:|---|---|---|---|---|

### Startup Behavior Per Config Option

| Config key | Value | Startup action | Evidence |
|---|---|---|---|

### Main Loop and Background Tasks

| ID | Function | Start condition | Interval | Stop condition | Provided service | Evidence |
|---|---|---|---|---|---|---|

### Service Shutdown Behavior

| Order | Action | Function | Config condition | Side effects | Evidence |
|---:|---|---|---|---|---|

### Shutdown Behavior Per Config Option

| Config key | Value | Shutdown action | Evidence |
|---|---|---|---|
```

### 7.4 feature_inventory_agent — Feature Inventory

Search terms: `feature, function, capability, enable, disable, flag, mode, experimental, deprecated, legacy, unused, dead, TODO, FIXME`

Deliverable:

```markdown
## Feature Inventory

### Feature List

| ID | Feature | Type | Active status | Entry point | Related config | Evidence |
|---|---|---|---|---|---|---|

### Inactive/dormant/dead code Candidates

| Item | Type | Reason | Evidence | Needs further check |
|---|---|---|---|---|

### Doc/Code Mismatch

| Item | Doc content | Code check result | Judgment | Evidence |
|---|---|---|---|---|

### Inter-Feature Dependencies

List all cases where feature A requires feature B to run first.

| Feature | Dependency feature | Dependency type | Dependency reason | Evidence |
|---|---|---|---|---|

Dependency type examples: prior execution required, shared state, prior authentication, prior data creation, prior initialization.
If there are none, state `No inter-feature dependencies`.

Diagram notation (optional):

{Feature A} --depends on--> {Feature B}
{Feature C} --depends on--> {Feature A}, {Feature D}
```

### 7.5 interface_protocol_agent — Interfaces & Protocols

Search terms: `api, route, router, endpoint, handler, controller, middleware, http, websocket, ws, rpc, grpc, cli, command, option, argument, port, listen, bind, event, packet, frame, message, opcode, payload, header, crc, checksum, serialize, deserialize, encode, decode, parser, send, write, emit, publish, broadcast, reply`

Deliverable:

```markdown
## Interfaces & Protocols

### API List

| ID | Type | Method | Path/Command | Handler | Request | Response | Auth | Evidence |
|---|---|---|---|---|---|---|---|---|

### Route List and Roles

| ID | Route Type | Method | Path/Name | Handler | Middleware | Request | Response | Role | Related object | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|

### CLI Command List

| Command | Args | Options | Handler | Role | Side effects | Evidence |
|---|---|---|---|---|---|---|

### Inbound List

| ID | Name | Initial receive function | Parser | Dispatcher | Opcode | Evidence |
|---|---|---|---|---|---|---|

### Inbound bit-level protocol

| Inbound | Offset bit | Size bit | Field | Endian | Type | Meaning | Validation location | Evidence |
|---|---:|---:|---|---|---|---|---|---|

### Outbound List

| ID | Name | Build function | Send function | Target | Trigger condition | Evidence |
|---|---|---|---|---|---|---|

### Outbound bit-level protocol

| Outbound | Offset bit | Size bit | Field | Endian | Type | Meaning | Build location | Evidence |
|---|---:|---:|---|---|---|---|---|---|

### Self-Originated Outbound

List all outbound generated by internal timers, state changes, or schedulers without external input.
Example targets: heartbeat/keep-alive, periodic status report/metrics emission, log rotation/retention cleanup, cache warming/pre-computation, timer-published notifications, state-change-triggered outbound.

| ID | Outbound | Trigger | Interval/condition | Target | Build function | Send function | Evidence |
|---|---|---|---|---|---|---|---|

Trigger classification examples: timer, state transition, scheduler, threshold breach, internal queue drain.
If there is none, state `No self-originated outbound`.
```

### 7.6 dataflow_state_agent — Data Flow & State

Search terms: `flow, pipeline, dispatch, handle, process, transform, state, transition, cache, registry, db, database, session, lock, mutex, concurrency, queue, channel, transaction`

Deliverable:

```markdown
## Data Flow & State

### Processing Flow from Input to Output

| ID | Input | Processing steps | Output | State change | Evidence |
|---|---|---|---|---|---|

### Per-Route Processing Flow

| Route | Order | Step | Function/method | Input | Output | Side effects | Evidence |
|---|---:|---|---|---|---|---|---|

### Per-Packet Behavior Flow

| Packet | Opcode | Receive | Parse | Validate | Process | Response | Evidence |
|---|---|---|---|---|---|---|---|

### Inbound → Outbound Mapping

| Inbound | Condition | Handler | State change | Outbound | Evidence |
|---|---|---|---|---|---|

### State Management

| State | Storage location | Create condition | Change condition | Delete condition | Concurrency control | Evidence |
|---|---|---|---|---|---|---|
```

### 7.7 config_environment_agent — Configuration & Environment

Search terms: `config, settings, option, env, environment, dotenv, yaml, json, toml, ini, load, reload, watch, default, validate, schema, save, migrate, flag`

Deliverable:

```markdown
## Configuration & Environment

### Config Key List

| Config key | Type | Default | Allowed values | Load location | Use location | Startup impact | Shutdown impact | Evidence |
|---|---|---|---|---|---|---|---|---|

### Config Loading Priority

| Order | Source | Description | Evidence |
|---:|---|---|---|

### Config File Management Method

| Item | Content | Evidence |
|---|---|---|

### Environment Variables

| Variable name | Role | Default | Use location | Evidence |
|---|---|---|---|---|
```

### 7.8 security_reliability_agent — Security & Reliability

Search terms: `auth, authenticate, authorize, permission, role, token, jwt, secret, password, key, cert, certificate, tls, ssl, encrypt, decrypt, validate, sanitize, error, exception, retry, timeout, fallback, circuit, panic, recover`

Deliverable:

```markdown
## Security & Reliability

### Security

| Item | Implemented | Implementation location | Description | Evidence |
|---|---|---|---|---|

### Trust Boundary

| Boundary | Input | Validation | Failure handling | Evidence |
|---|---|---|---|---|

### Error Handling

| Error type | Occurs at | Handling | Response/propagation | Evidence |
|---|---|---|---|---|

### Reliability

| Item | Implementation | Config key | Evidence |
|---|---|---|---|
| retry |  |  |  |
| timeout |  |  |  |
| fallback |  |  |  |
| failure propagation |  |  |  |
```

### 7.9 operations_observability_agent — Operations & Observability

Search terms: `log, logger, logging, trace, debug, info, warn, error, fatal, metric, metrics, health, healthcheck, monitor, monitoring, span, tracing, file, temp, cache, rotate, rolling, retention, cleanup, delete, remove`

Deliverable:

```markdown
## Operations & Observability

### Log Format

| Field | Value | Evidence |
|---|---|---|

### Log File Management

| Item | Value | Evidence |
|---|---|---|

### Metrics / Health Check / Monitoring

| Item | Implemented | Location | Description | Evidence |
|---|---|---|---|---|

### File Management Method

| File type | Path | Create condition | Delete condition | Retention policy | Evidence |
|---|---|---|---|---|---|
```

### 7.10 testing_coverage_agent — Testing & Coverage

Search terms: `test, spec, mock, stub, fixture, coverage, assert, unittest, pytest, jest, vitest, mocha, junit, e2e, integration, unit, unreachable`

Deliverable:

```markdown
## Testing & Coverage

### Test Structure

| Test type | Location | Target | How to run | Evidence |
|---|---|---|---|---|

### Coverage Gap

| Area | Test exists | Gap | Risk | Evidence |
|---|---|---|---|---|

### Test-Only Code Separation

| Item | Location | In runtime | Judgment | Evidence |
|---|---|---|---|---|
```

### 7.11 build_deployment_agent — Build & Deployment

Search terms: `build, compile, package, artifact, dist, release, deploy, deployment, Dockerfile, docker-compose, container, image, ci, workflow, make, cmake, gradle, maven, npm, pnpm, yarn, cargo, go build, runtime dependency`

Deliverable:

```markdown
## Build & Deployment

### Build Procedure

| Order | Command/task | Artifact | Evidence |
|---:|---|---|---|

### Build Artifacts

| Artifact | Location | Purpose | Evidence |
|---|---|---|---|

### Deployment

| Item | Content | Evidence |
|---|---|---|

### Runtime Dependency

| Dependency | Role | Required when | Evidence |
|---|---|---|---|
```

### 7.12 compatibility_limitation_agent — Compatibility & Limitations

Search terms: `version, compatibility, platform, windows, linux, macos, darwin, mode, profile, edition, feature flag, experimental, deprecated, legacy, limitation, risk, warning, TODO, FIXME`

Deliverable:

```markdown
## Compatibility & Limitations

### Compatibility

| Item | Condition | Branch location | Impact | Evidence |
|---|---|---|---|---|

### Constraints and Risks

| ID | Type | Content | Impact | Evidence | Needs further check |
|---|---|---|---|---|---|

### Doc/Code Mismatch

| Item | Doc | Code | Judgment | Evidence |
|---|---|---|---|---|
```

### 7.13 validation_agent — Overall Validation

Reviews all specialist agent results. Validation targets: missing documents, entrypoints, key objects, routes, APIs, CLI commands, parsers, encoders, send/write, config keys, state, shutdown hooks, loop/task, security items, log/metrics/health check, test areas, build/deployment procedures; confusion between documentation-only/test-only and runtime; conclusions without evidence; dead code candidates.

Deliverable:

```markdown
## Validation Checklist

| Item | Status | Evidence |
|---|---|---|

## Analysis Conflict List

| Item | Agent A opinion | Agent B opinion | Final judgment | Judgment basis |
|---|---|---|---|---|

## Possible Omission List

| Item | Possible omission | Recommended re-analysis agent | Evidence |
|---|---|---|---|
```

---

## 8. Bit-Level Protocol Analysis Rules

Perform protocol analysis in this order:

1. Find the raw byte receive location.
2. Find the buffer slicing location.
3. Find the struct unpack location.
4. Find the endian conversion location.
5. Find the enum/opcode mapping.
6. Find length validation.
7. Find checksum/CRC validation.
8. Find the payload decode location.
9. Find the handler dispatch location.
10. Find the response encode location.
11. Find the send/write/emit location.

Even if a field is byte-sized, convert to bit offset. Analysis table format:

```markdown
| Offset bit | Size bit | Field | Endian | Type | Meaning | Validation/build location | Evidence |
|---:|---:|---|---|---|---|---|---|
```

Fields that must be verified: `magic, version, header length, payload length, message type, opcode, flags, sequence id, session id, timestamp, checksum, crc, signature, compression flag, encryption flag, reserved bits, payload, padding, terminator`.

If there is no evidence, write `코드상 확인 불가`.

---

## 9. Final Report Template

```markdown
# 프로그램 종합 분석 보고서

## 1. Scope & Documentation

### 1.1 문서 목록
### 1.2 권장 읽기 순서
### 1.3 문서 간 의존 관계
### 1.4 stale 문서/링크 후보
### 1.5 프로젝트 목적
### 1.6 주요 사용자
### 1.7 시스템 경계
### 1.8 제공 기능 범위

## 2. Architecture & Components

### 2.1 모듈 구조
### 2.2 계층 구조
### 2.3 주요 컴포넌트
### 2.4 주요 객체의 역할과 기능 리스트
### 2.5 주요 객체별 기능 상세
### 2.6 책임 분리
### 2.7 내부 의존 관계
### 2.8 아키텍처 다이어그램 (ASCII)

## 3. Runtime Lifecycle

### 3.1 서비스 시작 동작
### 3.2 설정 옵션별 시작 동작
### 3.3 초기화 순서
### 3.4 메인 루프
### 3.5 background worker
### 3.6 서비스 종료 동작
### 3.7 설정 옵션별 종료 동작
### 3.8 signal/shutdown 처리

## 4. Feature Inventory

### 4.1 사용자 기능 목록
### 4.2 시스템 기능 목록
### 4.3 활성 기능
### 4.4 비활성/dormant 기능
### 4.5 dead code 후보
### 4.6 문서에는 있으나 코드에 없는 기능
### 4.7 코드에는 있으나 문서에 없는 기능
### 4.8 기능 간 의존 관계

## 5. Interfaces & Protocols

### 5.1 API 리스트
### 5.2 Route 리스트와 역할
### 5.3 Route별 처리 흐름
### 5.4 CLI command 리스트
### 5.5 CLI command 역할
### 5.6 네트워크 포트
### 5.7 이벤트
### 5.8 파일 입출력
### 5.9 외부 연동
### 5.10 Inbound 리스트
### 5.11 Inbound 프로토콜 비트 분석
### 5.12 Outbound 리스트
### 5.13 Outbound 프로토콜 비트 분석
### 5.14 자체 발생 Outbound

## 6. Data Flow & State

### 6.1 입력에서 출력까지의 처리 흐름
### 6.2 Route별 처리 흐름
### 6.3 패킷별 동작 흐름
### 6.4 Inbound별 Outbound 매핑
### 6.5 State transition
### 6.6 메모리 상태
### 6.7 Cache
### 6.8 Registry
### 6.9 DB
### 6.10 Session
### 6.11 Lock/Concurrency

## 7. Configuration & Environment

### 7.1 설정 파일 목록
### 7.2 설정 키 목록
### 7.3 기본값
### 7.4 허용값
### 7.5 환경 변수
### 7.6 CLI option
### 7.7 빌드 옵션
### 7.8 런타임 옵션
### 7.9 설정 로딩 우선순위
### 7.10 설정파일 관리 방법

## 8. Security & Reliability

### 8.1 인증
### 8.2 권한
### 8.3 암호화
### 8.4 인증서
### 8.5 Secret 관리
### 8.6 Input validation
### 8.7 Trust boundary
### 8.8 오류 응답
### 8.9 예외 처리
### 8.10 Retry
### 8.11 Timeout
### 8.12 Fallback
### 8.13 실패 전파 방식

## 9. Operations & Observability

### 9.1 로그 포맷
### 9.2 로그 파일 관리
### 9.3 Metrics
### 9.4 Health check
### 9.5 Monitoring
### 9.6 Background worker
### 9.7 파일 관리 방법
### 9.8 Rotation
### 9.9 Retention
### 9.10 Cleanup

## 10. Testing & Coverage

### 10.1 테스트 구조
### 10.2 테스트 대상
### 10.3 Mock/Stub
### 10.4 Coverage gap
### 10.5 도달 불가 코드
### 10.6 테스트 전용 기능
### 10.7 Runtime 기능과 테스트 기능 분리

## 11. Build & Deployment

### 11.1 빌드 절차
### 11.2 빌드 산출물
### 11.3 Packaging
### 11.4 Container
### 11.5 Release 절차
### 11.6 Runtime dependency
### 11.7 Deployment configuration

## 12. Compatibility & Limitations

### 12.1 버전 호환성
### 12.2 플랫폼 차이
### 12.3 제품/모드별 분기
### 12.4 Feature flag 분기
### 12.5 알려진 제약
### 12.6 Dead code 후보
### 12.7 문서와 코드 불일치
### 12.8 운영 리스크
### 12.9 추가 확인 필요 항목

## 13. Validation

### 13.1 검증 체크리스트
### 13.2 분석 결과 충돌 목록
### 13.3 누락 가능성 목록
### 13.4 최종 신뢰도 평가

## 14. Evidence Index

### 14.1 파일별 근거
### 14.2 심볼별 근거
### 14.3 호출 그래프 근거
```

---

## 10. Merge Priority

Each category's owner is its like-named specialist agent (e.g. `scope_documentation` → documentation_scope_agent). The coordinator merges by owner and does not delete duplicate analyses. Record any conflict:

```markdown
## Analysis Conflict List

| Item | Agent A opinion | Agent B opinion | Final judgment | Judgment basis |
|---|---|---|---|---|
```

---

## 11. Evidence Notation Rules

Attach evidence to every conclusion.

```text
근거: <file_path>::<symbol_name>
근거: <file_path>:<line_range>
근거: callgraph <caller> -> <callee>
근거: config <file_path>::<key>
근거: route <method> <path> -> <handler>
근거: protocol <parser_symbol> -> <dispatcher_symbol> -> <handler_symbol>
```

When evidence is insufficient, mark as follows.

```text
확인 불가: 코드상 해당 동작을 확인할 수 없음
추정: 이름과 호출 위치상 가능성이 있으나 직접 근거 부족
```

---

## 12. Analysis Quality Criteria

Analysis is complete when all of the following are verified:

- All major documents reviewed.
- All entrypoints, server listen/bind points, API/route registration points, and route handlers.
- All CLI commands.
- All packet parsers, encoders, and send/write/emit points.
- All config loading points and environment variable usage points.
- All log initialization points; whether metrics and health check exist.
- All shutdown hooks and all loops/tasks/workers.
- Definition, creation, and usage locations of key objects; state-holding objects and concurrency control.
- Test-only code separated from runtime code; documentation-only features separated from implemented features; dead-code candidates marked separately.
- Build and deployment artifact paths; platform/mode/feature-flag branching.
- Inter-feature dependencies; triggers and intervals of self-originated outbound.
- Architecture diagram written, with every diagram component present in the body and every body service present in the diagram.

---

## 13. Final Coordinator Prompt

```markdown
You are the parallel code analysis coordinator. Analyze the target project's full
features, structure, operational characteristics, and risks in detail, distributing
work to specialist agents in parallel across the 12 core categories (§1).
`codegraph` and `Serena MCP` are optional; agents prefer them when active.

Work order:

1. Activate the project.
2. If Serena MCP is active, perform onboarding.
3. If codegraph is active, create or refresh the index.
4. First-pass survey: file tree, entrypoints, config files, docs.
5. Distribute task scope per specialist agent.
6. Run Phase 1 agents in parallel.
7. Summarize Phase 1 and pass to Phase 2.
8. Run Phase 2 agents in parallel.
9. Summarize Phase 2 and pass to Phase 3.
10. Run Phase 3 agents in parallel.
11. Merge all agent results.
12. Consolidate conflict items.
13. Have validation_agent perform verification.
14. Re-analyze any omitted items with the relevant specialist agent.
15. Write the final report.

Follow the Core Principles (§2): evidence on every conclusion, `확인 불가` / `추정`
marking, strict separation of documentation-only / test-only / runtime features,
and Korean output.
```
