---
name: program-analysis-skill
description: 기존 프로그램의 기능, 구조, 운영 특성, 프로토콜, 리스크를 12개 핵심 카테고리 기반으로 종합 분석한다. 병렬 specialist agent 구조를 사용하며, codegraph 와 Serena MCP 가 활성화되어 있으면 우선 사용한다 (optional, 없어도 동작).
---

# 병렬 프로그램 종합 분석 Skill

## 1. 목적

이 skill은 기존 프로그램의 기능, 구조, 운영 특성, 프로토콜, 리스크를 종합 분석한다.

`codegraph`, `Serena MCP`가 활성화되어 있으면 우선 사용한다.

두 도구는 optional이며, 사용 가능 여부는 분석 시작 시 자동 감지한다.

분석은 단일 agent가 순차 수행하지 않는다.

여러 specialist agent가 병렬로 분석하고, coordinator agent가 결과를 병합한다.

최종 산출물은 다음 12개 핵심 카테고리를 기본 구조로 사용한다.

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

프로젝트 성격에 따라 `Protocols`, `Deployment`, `Security`, `Coverage` 섹션은 더 상세히 확장한다.

---

## 2. 핵심 원칙

모든 결론은 코드 근거를 기반으로 작성한다.

근거 없는 내용은 단정하지 않는다.

추정은 반드시 `추정`으로 표시한다.

확인되지 않은 항목은 반드시 `확인 불가`로 표시한다.

문서 전용 기능, 테스트 전용 기능, 실제 runtime 기능을 분리한다.

README, docs, test code만 근거로 runtime 기능을 단정하지 않는다.

프로토콜 endian, checksum, CRC, 암호화 방식은 코드 근거 없이는 추정하지 않는다.

분석 중 코드는 수정하지 않는다.

---

## 3. 사용 도구 역할

`codegraph`와 `Serena MCP`는 optional이다.

분석 시작 시 두 도구의 활성 여부를 자동 감지하고, 활성화되어 있으면 우선 사용한다.

비활성 환경에서도 분석은 진행한다. 비활성 시점에 어떤 도구를 사용할지에 대한 별도 fallback 가이드는 본 skill에서 규정하지 않는다.

### 3.1 Serena MCP (optional)

Serena MCP는 활성 시 심볼 단위 코드 탐색에 우선 사용한다.

주요 용도는 다음과 같다.

- project activation
- onboarding
- directory listing
- file reading
- symbol overview
- symbol definition lookup
- referencing symbol lookup
- pattern search
- memory 저장

활성 환경에서 권장 사용 도구 예시는 다음과 같다.

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

codegraph는 활성 시 구조적 관계 분석에 우선 사용한다.

주요 용도는 다음과 같다.

- 전체 코드 인덱싱
- 호출자 분석
- 피호출자 분석
- 호출 체인 분석
- 모듈 의존성 분석
- 클래스/구조체 관계 분석
- API route와 handler 연결 추적
- parser에서 dispatcher까지 흐름 추적
- encoder에서 send/write까지 흐름 추적
- dead code 후보 탐지

---

## 4. 입력 형식

분석 agent는 다음 입력을 받을 수 있다.

```yaml
target_project_path: "<분석할 프로젝트 루트>"
entrypoints:
  - "<서비스 main 파일 또는 실행 바이너리>"
  - "<서버 시작 스크립트>"
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

entrypoint가 명시되지 않으면 coordinator가 후보를 찾아야 한다.

---

## 5. 최종 요구사항

프로그램의 기능과 구조를 전부 상세히 분석한다. `codegraph`, `Serena MCP`가 활성화되어 있으면 우선 사용한다.

분석 작업은 병렬 specialist agent 구조로 수행한다.

최종 보고서는 12개 핵심 카테고리 구조를 따른다.

### 5.1 Scope & Documentation

- 문서 목록
- 읽는 순서
- 문서 간 의존 관계
- stale 문서/링크
- 프로젝트 목적
- 주요 사용자
- 시스템 경계
- 제공 기능 범위

### 5.2 Architecture & Components

- 모듈 구조
- 계층 구조
- 주요 컴포넌트
- 주요 객체의 역할과 기능 리스트
- 객체별 생성 위치와 사용 위치
- 책임 분리
- 내부 의존 관계
- 아키텍처 다이어그램 (ASCII art)

### 5.3 Runtime Lifecycle

- 서비스 시작 시 기본 동작
- 설정 옵션에 따른 시작 동작
- 초기화 순서
- 메인 루프
- background worker
- 서비스 종료 시 동작
- 설정 옵션에 따른 종료 동작
- signal/shutdown 처리

### 5.4 Feature Inventory

- 사용자 기능 목록
- 시스템 기능 목록
- 활성 기능
- 비활성 기능
- dormant 기능
- dead code 후보
- 문서에는 있으나 코드에 없는 기능
- 코드에는 있으나 문서에 없는 기능
- 기능 간 의존 관계

### 5.5 Interfaces & Protocols

- API 리스트
- route가 있다면 route 리스트와 역할
- CLI command 리스트
- CLI command 역할 리스트
- 네트워크 포트
- 이벤트
- 파일 입출력
- 외부 연동
- inbound 리스트
- outbound 리스트
- 자체 발생 outbound (외부 입력 없이 내부 timer/state 변화로 발생하는 outbound)
- inbound/outbound bit-level protocol 분석

### 5.6 Data Flow & State

- 입력에서 처리와 출력까지의 흐름
- route별 처리 흐름
- 패킷별 동작 흐름
- inbound 데이터에 따른 outbound 종류
- state transition
- 메모리 상태
- cache
- registry
- DB
- session
- lock/concurrency

### 5.7 Configuration & Environment

- 설정 종류
- 설정파일 관리 방법
- 설정 키 목록
- 기본값
- 허용값
- 환경 변수
- CLI option
- 빌드 옵션
- 런타임 옵션
- 설정 로딩 우선순위

### 5.8 Security & Reliability

- 인증
- 권한
- 암호화
- 인증서
- secret 관리
- input validation
- trust boundary
- 오류 응답
- 예외 처리
- retry
- timeout
- fallback
- 실패 전파 방식

### 5.9 Operations & Observability

- 로그 포맷
- 로그 파일 관리
- metrics
- health check
- monitoring
- background worker
- 파일 관리 방법
- rotation
- retention
- cleanup

### 5.10 Testing & Coverage

- 테스트 구조
- 테스트 대상
- mock/stub
- coverage gap
- 도달 불가 코드
- 테스트 전용 기능
- runtime 기능과 테스트 기능 분리

### 5.11 Build & Deployment

- 빌드 절차
- 빌드 산출물
- packaging
- container
- release 절차
- runtime dependency
- deployment configuration

### 5.12 Compatibility & Limitations

- 버전 호환성
- 플랫폼 차이
- 제품/모드별 분기
- feature flag 분기
- 알려진 제약
- dead code 후보
- 문서와 코드 불일치
- 운영 리스크
- 추가 확인 필요 항목

---

## 6. 병렬 Agent 구성

```yaml
agents:
  coordinator:
    role: "전체 분석 계획, 작업 분배, 병합, 충돌 해결"

  documentation_scope_agent:
    role: "문서 맵, 프로젝트 목적, 시스템 경계, stale 문서 분석"

  architecture_component_agent:
    role: "모듈 구조, 주요 객체, 컴포넌트 책임 분석"

  runtime_lifecycle_agent:
    role: "시작, 종료, 초기화, 루프, signal, shutdown 분석"

  feature_inventory_agent:
    role: "기능 목록, 활성/비활성 기능, dormant/dead code 분석"

  interface_protocol_agent:
    role: "API, route, CLI, inbound/outbound, protocol 분석"

  dataflow_state_agent:
    role: "처리 흐름, 상태 전이, session, cache, DB, lock 분석"

  config_environment_agent:
    role: "설정 파일, 환경변수, 옵션, 기본값, 로딩 우선순위 분석"

  security_reliability_agent:
    role: "인증, 권한, secret, validation, error, retry, timeout 분석"

  operations_observability_agent:
    role: "로그, metrics, health check, 파일 관리, cleanup 분석"

  testing_coverage_agent:
    role: "테스트 구조, coverage gap, mock/stub, 도달 불가 코드 분석"

  build_deployment_agent:
    role: "빌드, 패키징, 컨테이너, 배포, runtime dependency 분석"

  compatibility_limitation_agent:
    role: "호환성, 모드 분기, feature flag, 제약과 리스크 분석"

  validation_agent:
    role: "누락 검증, 근거 검증, 충돌 정리"
```

---

## 7. 병렬 실행 Phase

### 7.1 Phase 0. Coordinator 초기화

coordinator는 다음을 먼저 수행한다.

```markdown
1. 프로젝트 루트 확인
2. Serena MCP가 활성화되어 있으면 project activation 및 onboarding 수행
3. codegraph가 활성화되어 있으면 index 생성 또는 갱신
4. 파일 트리 확인
5. entrypoint 후보 확인
6. 설정 파일 후보 확인
7. 문서 파일 후보 확인
8. specialist agent별 작업 분배
```

산출물은 다음 형식을 따른다.

```markdown
## 분석 작업 분배표

| Agent | 담당 범위 | 주요 검색어 | 예상 산출물 |
|---|---|---|---|
```

### 7.2 Phase 1. 기본 구조 분석

```yaml
parallel_group_1:
  - documentation_scope_agent
  - architecture_component_agent
  - config_environment_agent
  - build_deployment_agent
```

Phase 1은 프로젝트의 경계와 구조를 먼저 확정한다.

이 결과는 Phase 2 agent에게 전달한다.

### 7.3 Phase 2. 동작과 인터페이스 분석

```yaml
parallel_group_2:
  - runtime_lifecycle_agent
  - feature_inventory_agent
  - interface_protocol_agent
  - dataflow_state_agent
```

Phase 2는 실제 실행 흐름과 기능을 분석한다.

API, route, CLI, packet, loop, state transition을 집중 분석한다.

### 7.4 Phase 3. 품질과 운영 분석

```yaml
parallel_group_3:
  - security_reliability_agent
  - operations_observability_agent
  - testing_coverage_agent
  - compatibility_limitation_agent
```

Phase 3은 운영성, 안정성, 테스트, 리스크를 분석한다.

### 7.5 Phase 4. 병합과 검증

```yaml
parallel_group_4:
  - validation_agent
```

Coordinator는 모든 agent 결과를 병합한다.

Validation agent는 누락과 충돌을 검증한다.

---

## 8. Agent별 분석 지시

### 8.1 documentation_scope_agent

```markdown
너는 documentation_scope_agent다.

담당 카테고리는 Scope & Documentation이다.

분석 대상:

- README
- docs
- changelog
- architecture 문서
- API 문서
- protocol 문서
- deployment 문서
- config 문서
- stale 링크
- 문서 간 의존 관계
- 프로젝트 목적
- 주요 사용자
- 시스템 경계
- 제공 기능 범위

검색어:

README, docs, documentation, overview, guide, architecture,
design, protocol, api, deployment, config, changelog, roadmap

산출물:

## Scope & Documentation

### 문서 목록

| 문서 | 역할 | 읽는 순서 | 관련 문서 | stale 후보 | 근거 |
|---|---|---:|---|---|---|

### 프로젝트 범위

| 항목 | 내용 | 근거 |
|---|---|---|
| 프로젝트 목적 |  |  |
| 주요 사용자 |  |  |
| 시스템 경계 |  |  |
| 제공 기능 범위 |  |  |
| 제외 범위 |  |  |
```

### 8.2 architecture_component_agent

```markdown
너는 architecture_component_agent다.

담당 카테고리는 Architecture & Components다.

분석 대상:

- 모듈 구조
- 계층 구조
- 주요 컴포넌트
- 주요 객체
- class
- struct
- interface
- service
- manager
- controller
- handler
- repository
- store
- registry
- factory
- provider
- client
- server
- session
- context
- state
- model
- entity

검색어:

class, struct, interface, type, module, component, service,
manager, controller, handler, repository, store, registry,
factory, provider, client, server, session, context, state,
model, entity

산출물:

## Architecture & Components

### 모듈 구조

| 모듈 | 역할 | 주요 파일 | 의존 모듈 | 근거 |
|---|---|---|---|---|

### 주요 객체의 역할과 기능 리스트

| ID | 객체명 | 종류 | 파일 | 주요 역할 | 주요 메서드/함수 | 생성 위치 | 사용 위치 | 상태 보유 여부 | 근거 |
|---|---|---|---|---|---|---|---|---|---|

### 주요 객체별 기능 상세

| 객체 | 기능 | 메서드/함수 | 입력 | 출력 | 부작용 | 근거 |
|---|---|---|---|---|---|---|

### 아키텍처 다이어그램 (ASCII)

ASCII art 로 컴포넌트 관계와 데이터 흐름을 표현한다.

작성 규칙:

- box-drawing characters 사용: `+---+`, `|   |`
- 데이터 흐름은 화살표로 표시: `-->`, `<--`, `<-->`
- 모든 화살표에 무엇이 흐르는지 라벨링한다
- 외부 시스템 (DB, MQ, API, file storage) 포함
- 80 ~ 100 컬럼 너비 유지
- 기호가 자명하지 않으면 legend 추가
- 다이어그램의 모든 컴포넌트는 본문 텍스트에 등장해야 한다
- 본문에서 기술한 모든 service 는 다이어그램에 등장해야 한다

예시 스타일:

```
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
```

### 8.3 runtime_lifecycle_agent

```markdown
너는 runtime_lifecycle_agent다.

담당 카테고리는 Runtime Lifecycle이다.

분석 대상:

- entrypoint
- main
- bootstrap
- init
- start
- run
- serve
- listen
- bind
- loop
- scheduler
- worker
- background task
- signal
- SIGINT
- SIGTERM
- shutdown
- close
- cleanup
- dispose
- destroy

검색어:

main, entrypoint, bootstrap, init, start, run, serve, listen,
bind, loop, scheduler, worker, thread, spawn, signal, SIGINT,
SIGTERM, shutdown, close, cleanup, dispose, destroy

산출물:

## Runtime Lifecycle

### 서비스 시작 동작

| 순서 | 동작 | 함수 | 설정 조건 | 부작용 | 근거 |
|---:|---|---|---|---|---|

### 설정 옵션별 시작 동작

| 설정 키 | 값 | 시작 동작 | 근거 |
|---|---|---|---|

### 메인 루프와 background task

| ID | 기능 | 시작 조건 | 주기 | 종료 조건 | 제공 서비스 | 근거 |
|---|---|---|---|---|---|---|

### 서비스 종료 동작

| 순서 | 동작 | 함수 | 설정 조건 | 부작용 | 근거 |
|---:|---|---|---|---|---|

### 설정 옵션별 종료 동작

| 설정 키 | 값 | 종료 동작 | 근거 |
|---|---|---|---|
```

### 8.4 feature_inventory_agent

```markdown
너는 feature_inventory_agent다.

담당 카테고리는 Feature Inventory다.

분석 대상:

- 사용자 기능
- 시스템 기능
- 자동 동작 기능
- 활성 기능
- 비활성 기능
- dormant 기능
- dead code 후보
- 문서에는 있으나 코드에 없는 기능
- 코드에는 있으나 문서에 없는 기능

검색어:

feature, function, capability, enable, disable, flag, mode,
experimental, deprecated, legacy, unused, dead, TODO, FIXME

산출물:

## Feature Inventory

### 기능 목록

| ID | 기능 | 유형 | 활성 상태 | 진입점 | 관련 설정 | 근거 |
|---|---|---|---|---|---|---|

### 비활성/dormant/dead code 후보

| 항목 | 유형 | 판단 이유 | 근거 | 추가 확인 필요 |
|---|---|---|---|---|

### 문서와 코드 불일치

| 항목 | 문서 내용 | 코드 확인 결과 | 판단 | 근거 |
|---|---|---|---|---|

### 기능 간 의존 관계

기능 A 가 동작하기 위해 기능 B 가 먼저 동작해야 하는 경우를 모두 나열한다.

| 기능 | 의존 기능 | 의존 유형 | 의존 이유 | 근거 |
|---|---|---|---|---|

의존 유형 예: 선행 실행 필요, 상태 공유, 인증 선행, 데이터 생성 선행, 초기화 선행

의존 관계가 없으면 `기능 간 의존 관계 없음` 으로 명시한다.

다이어그램 표기 (선택):

```text
{Feature A} --depends on--> {Feature B}
{Feature C} --depends on--> {Feature A}, {Feature D}
```
```

### 8.5 interface_protocol_agent

```markdown
너는 interface_protocol_agent다.

담당 카테고리는 Interfaces & Protocols다.

분석 대상:

- API
- route
- CLI command
- network port
- event
- file input/output
- external integration
- inbound
- outbound
- packet
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

검색어:

api, route, router, endpoint, handler, controller, middleware,
http, websocket, ws, rpc, grpc, cli, command, option, argument,
port, listen, bind, event, packet, frame, message, opcode,
payload, header, crc, checksum, serialize, deserialize, encode,
decode, parser, send, write, emit, publish, broadcast, reply

산출물:

## Interfaces & Protocols

### API 리스트

| ID | Type | Method | Path/Command | Handler | Request | Response | Auth | 근거 |
|---|---|---|---|---|---|---|---|---|

### Route 리스트와 역할

| ID | Route Type | Method | Path/Name | Handler | Middleware | Request | Response | 역할 | 관련 객체 | 근거 |
|---|---|---|---|---|---|---|---|---|---|---|

### CLI command 리스트

| Command | Args | Options | Handler | 역할 | 부작용 | 근거 |
|---|---|---|---|---|---|---|

### Inbound 리스트

| ID | 이름 | 최초 수신 함수 | Parser | Dispatcher | Opcode | 근거 |
|---|---|---|---|---|---|---|

### Inbound bit-level protocol

| Inbound | Offset bit | Size bit | Field | Endian | Type | 의미 | 검증 위치 | 근거 |
|---|---:|---:|---|---|---|---|---|---|

### Outbound 리스트

| ID | 이름 | 생성 함수 | 전송 함수 | 대상 | 발생 조건 | 근거 |
|---|---|---|---|---|---|---|

### Outbound bit-level protocol

| Outbound | Offset bit | Size bit | Field | Endian | Type | 의미 | 생성 위치 | 근거 |
|---|---:|---:|---|---|---|---|---|---|

### 자체 발생 Outbound

외부 입력 없이 내부 timer, 상태 변화, 스케줄러에 의해 발생하는 outbound 를 모두 나열한다.

대상 예시:

- heartbeat / keep-alive
- 주기적 status report / metrics emission
- 로그 rotation, retention cleanup
- cache warming, pre-computation
- 내부 timer 기반 알림/이벤트 발행
- 내부 상태 변화로 트리거되는 outbound

| ID | Outbound | 발생 트리거 | 발생 주기/조건 | 대상 | 생성 함수 | 전송 함수 | 근거 |
|---|---|---|---|---|---|---|---|

트리거 분류 예: timer, state transition, scheduler, threshold breach, internal queue drain

자체 발생 outbound 가 없으면 `자체 발생 outbound 없음` 으로 명시한다.
```

### 8.6 dataflow_state_agent

```markdown
너는 dataflow_state_agent다.

담당 카테고리는 Data Flow & State다.

분석 대상:

- route flow
- packet flow
- inbound to outbound mapping
- processing pipeline
- state transition
- memory state
- cache
- registry
- DB
- session
- lock
- mutex
- concurrency
- queue

검색어:

flow, pipeline, dispatch, handle, process, transform, state,
transition, cache, registry, db, database, session, lock, mutex,
concurrency, queue, channel, transaction

산출물:

## Data Flow & State

### 입력에서 출력까지의 처리 흐름

| ID | 입력 | 처리 단계 | 출력 | 상태 변경 | 근거 |
|---|---|---|---|---|---|

### Route별 처리 흐름

| Route | 순서 | 단계 | 함수/메서드 | 입력 | 출력 | 부작용 | 근거 |
|---|---:|---|---|---|---|---|---|

### 패킷별 동작 흐름

| Packet | Opcode | 수신 | 파싱 | 검증 | 처리 | 응답 | 근거 |
|---|---|---|---|---|---|---|---|

### Inbound → Outbound 매핑

| Inbound | 조건 | Handler | 상태 변경 | Outbound | 근거 |
|---|---|---|---|---|---|

### State Management

| 상태 | 보관 위치 | 생성 조건 | 변경 조건 | 삭제 조건 | 동시성 제어 | 근거 |
|---|---|---|---|---|---|---|
```

### 8.7 config_environment_agent

```markdown
너는 config_environment_agent다.

담당 카테고리는 Configuration & Environment다.

분석 대상:

- config file
- environment variable
- CLI option
- build option
- runtime option
- default value
- config schema
- validation
- reload
- watch
- save
- migration

검색어:

config, settings, option, env, environment, dotenv, yaml, json,
toml, ini, load, reload, watch, default, validate, schema, save,
migrate, flag

산출물:

## Configuration & Environment

### 설정 키 목록

| 설정 키 | 타입 | 기본값 | 허용값 | 로딩 위치 | 사용 위치 | 시작 영향 | 종료 영향 | 근거 |
|---|---|---|---|---|---|---|---|---|

### 설정 로딩 우선순위

| 순서 | 소스 | 설명 | 근거 |
|---:|---|---|---|

### 설정파일 관리 방법

| 항목 | 내용 | 근거 |
|---|---|---|

### 환경 변수

| 변수명 | 역할 | 기본값 | 사용 위치 | 근거 |
|---|---|---|---|---|
```

### 8.8 security_reliability_agent

```markdown
너는 security_reliability_agent다.

담당 카테고리는 Security & Reliability다.

분석 대상:

- authentication
- authorization
- encryption
- certificate
- secret
- token
- password
- input validation
- trust boundary
- exception
- error response
- retry
- timeout
- fallback
- circuit breaker
- failure propagation

검색어:

auth, authenticate, authorize, permission, role, token, jwt,
secret, password, key, cert, certificate, tls, ssl, encrypt,
decrypt, validate, sanitize, error, exception, retry, timeout,
fallback, circuit, panic, recover

산출물:

## Security & Reliability

### Security

| 항목 | 구현 여부 | 구현 위치 | 설명 | 근거 |
|---|---|---|---|---|

### Trust Boundary

| 경계 | 입력 | 검증 | 실패 처리 | 근거 |
|---|---|---|---|---|

### Error Handling

| 오류 유형 | 발생 위치 | 처리 방식 | 응답/전파 | 근거 |
|---|---|---|---|---|

### Reliability

| 항목 | 구현 방식 | 설정 키 | 근거 |
|---|---|---|---|
| retry |  |  |  |
| timeout |  |  |  |
| fallback |  |  |  |
| failure propagation |  |  |  |
```

### 8.9 operations_observability_agent

```markdown
너는 operations_observability_agent다.

담당 카테고리는 Operations & Observability다.

분석 대상:

- logging
- log format
- log level
- log file
- metrics
- health check
- monitoring
- tracing
- background worker
- file management
- rotation
- retention
- cleanup
- temp file
- cache file

검색어:

log, logger, logging, trace, debug, info, warn, error, fatal,
metric, metrics, health, healthcheck, monitor, monitoring,
span, tracing, file, temp, cache, rotate, rolling, retention,
cleanup, delete, remove

산출물:

## Operations & Observability

### 로그 포맷

| 필드 | 값 | 근거 |
|---|---|---|

### 로그 파일 관리

| 항목 | 값 | 근거 |
|---|---|---|

### Metrics / Health Check / Monitoring

| 항목 | 구현 여부 | 위치 | 설명 | 근거 |
|---|---|---|---|---|

### 파일 관리 방법

| 파일 종류 | 경로 | 생성 조건 | 삭제 조건 | 보관 정책 | 근거 |
|---|---|---|---|---|---|
```

### 8.10 testing_coverage_agent

```markdown
너는 testing_coverage_agent다.

담당 카테고리는 Testing & Coverage다.

분석 대상:

- test structure
- unit test
- integration test
- e2e test
- mock
- stub
- fixture
- coverage
- unreachable code
- test-only feature
- runtime feature

검색어:

test, spec, mock, stub, fixture, coverage, assert, unittest,
pytest, jest, vitest, mocha, junit, e2e, integration, unit,
unreachable

산출물:

## Testing & Coverage

### 테스트 구조

| 테스트 유형 | 위치 | 대상 | 실행 방법 | 근거 |
|---|---|---|---|---|

### Coverage Gap

| 영역 | 테스트 존재 여부 | gap | 리스크 | 근거 |
|---|---|---|---|---|

### 테스트 전용 코드 분리

| 항목 | 위치 | runtime 포함 여부 | 판단 | 근거 |
|---|---|---|---|---|
```

### 8.11 build_deployment_agent

```markdown
너는 build_deployment_agent다.

담당 카테고리는 Build & Deployment다.

분석 대상:

- build script
- package manager
- artifact
- Dockerfile
- container
- compose
- CI
- release
- runtime dependency
- deployment config
- install script

검색어:

build, compile, package, artifact, dist, release, deploy,
deployment, Dockerfile, docker-compose, container, image, ci,
workflow, make, cmake, gradle, maven, npm, pnpm, yarn, cargo,
go build, runtime dependency

산출물:

## Build & Deployment

### 빌드 절차

| 순서 | 명령/작업 | 산출물 | 근거 |
|---:|---|---|---|

### 빌드 산출물

| 산출물 | 생성 위치 | 사용 목적 | 근거 |
|---|---|---|---|

### Deployment

| 항목 | 내용 | 근거 |
|---|---|---|

### Runtime Dependency

| 의존성 | 역할 | 필요 시점 | 근거 |
|---|---|---|---|
```

### 8.12 compatibility_limitation_agent

```markdown
너는 compatibility_limitation_agent다.

담당 카테고리는 Compatibility & Limitations다.

분석 대상:

- version compatibility
- platform difference
- OS-specific code
- product mode
- feature flag
- limitation
- risk
- deprecated code
- legacy code
- document/code mismatch
- operational risk

검색어:

version, compatibility, platform, windows, linux, macos, darwin,
mode, profile, edition, feature flag, experimental, deprecated,
legacy, limitation, risk, warning, TODO, FIXME

산출물:

## Compatibility & Limitations

### 호환성

| 항목 | 조건 | 분기 위치 | 영향 | 근거 |
|---|---|---|---|---|

### 제약과 리스크

| ID | 유형 | 내용 | 영향 | 근거 | 추가 확인 필요 |
|---|---|---|---|---|---|

### 문서와 코드 불일치

| 항목 | 문서 | 코드 | 판단 | 근거 |
|---|---|---|---|---|
```

### 8.13 validation_agent

```markdown
너는 validation_agent다.

담당 카테고리는 전체 검증이다.

모든 specialist agent 결과를 검토한다.

검증 대상:

- 누락된 문서
- 누락된 entrypoint
- 누락된 주요 객체
- 누락된 route
- 누락된 API
- 누락된 CLI command
- 누락된 parser
- 누락된 encoder
- 누락된 send/write
- 누락된 config key
- 누락된 state
- 누락된 shutdown hook
- 누락된 loop/task
- 누락된 security 항목
- 누락된 log/metrics/health check
- 누락된 test 영역
- 누락된 build/deployment 절차
- 문서 전용 기능과 runtime 기능 혼동
- 테스트 전용 코드와 runtime 코드 혼동
- 근거 없는 결론
- dead code 후보

산출물:

## 검증 체크리스트

| 항목 | 상태 | 근거 |
|---|---|---|

## 분석 결과 충돌 목록

| 항목 | Agent A 의견 | Agent B 의견 | 최종 판단 | 판단 근거 |
|---|---|---|---|---|

## 누락 가능성 목록

| 항목 | 누락 가능성 | 재분석 권장 agent | 근거 |
|---|---|---|---|
```

---

## 9. Bit-Level Protocol 분석 규칙

프로토콜 분석은 다음 순서로 수행한다.

1. raw byte 수신 위치를 찾는다.
2. buffer slicing 위치를 찾는다.
3. struct unpack 위치를 찾는다.
4. endian 변환 위치를 찾는다.
5. enum/opcode 매핑을 찾는다.
6. length 검증을 찾는다.
7. checksum/CRC 검증을 찾는다.
8. payload decode 위치를 찾는다.
9. handler dispatch 위치를 찾는다.
10. response encode 위치를 찾는다.
11. send/write/emit 위치를 찾는다.

필드 단위가 byte여도 bit offset으로 환산한다.

분석 표는 다음 형식을 따른다.

```markdown
| Offset bit | Size bit | Field | Endian | Type | 의미 | 검증/생성 위치 | 근거 |
|---:|---:|---|---|---|---|---|---|
```

반드시 확인할 필드는 다음과 같다.

```text
magic
version
header length
payload length
message type
opcode
flags
sequence id
session id
timestamp
checksum
crc
signature
compression flag
encryption flag
reserved bits
payload
padding
terminator
```

근거가 없으면 `코드상 확인 불가`라고 쓴다.

---

## 10. 최종 보고서 템플릿

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

## 11. 병합 우선순위

```yaml
merge_priority:
  scope_documentation:
    owner: documentation_scope_agent

  architecture_components:
    owner: architecture_component_agent

  runtime_lifecycle:
    owner: runtime_lifecycle_agent

  feature_inventory:
    owner: feature_inventory_agent

  interfaces_protocols:
    owner: interface_protocol_agent

  dataflow_state:
    owner: dataflow_state_agent

  configuration_environment:
    owner: config_environment_agent

  security_reliability:
    owner: security_reliability_agent

  operations_observability:
    owner: operations_observability_agent

  testing_coverage:
    owner: testing_coverage_agent

  build_deployment:
    owner: build_deployment_agent

  compatibility_limitations:
    owner: compatibility_limitation_agent

  validation:
    owner: validation_agent
```

중복 분석은 삭제하지 않는다.

충돌이 있으면 다음 표에 남긴다.

```markdown
## 분석 결과 충돌 목록

| 항목 | Agent A 의견 | Agent B 의견 | 최종 판단 | 판단 근거 |
|---|---|---|---|---|
```

---

## 12. 증거 표기 규칙

모든 결론에는 근거를 붙인다.

```text
근거: <file_path>::<symbol_name>
근거: <file_path>:<line_range>
근거: callgraph <caller> -> <callee>
근거: config <file_path>::<key>
근거: route <method> <path> -> <handler>
근거: protocol <parser_symbol> -> <dispatcher_symbol> -> <handler_symbol>
```

근거가 부족하면 다음처럼 표시한다.

```text
확인 불가: 코드상 해당 동작을 확인할 수 없음
추정: 이름과 호출 위치상 가능성이 있으나 직접 근거 부족
```

---

## 13. 분석 품질 기준

분석 완료 조건은 다음과 같다.

- 모든 주요 문서를 확인했다.
- 모든 entrypoint를 확인했다.
- 모든 server listen/bind 지점을 확인했다.
- 모든 API와 route 등록 지점을 확인했다.
- 모든 route handler를 확인했다.
- 모든 CLI command를 확인했다.
- 모든 packet parser를 확인했다.
- 모든 encoder를 확인했다.
- 모든 send/write/emit 지점을 확인했다.
- 모든 설정 로딩 지점을 확인했다.
- 모든 환경 변수 사용 지점을 확인했다.
- 모든 로그 초기화 지점을 확인했다.
- metrics와 health check 존재 여부를 확인했다.
- 모든 shutdown hook을 확인했다.
- 모든 loop/task/worker를 확인했다.
- 주요 객체의 정의, 생성, 사용 위치를 확인했다.
- 상태 보유 객체와 동시성 제어를 확인했다.
- 테스트 전용 코드와 runtime 코드를 분리했다.
- 문서 전용 기능과 실제 구현 기능을 분리했다.
- dead code 가능성이 있는 기능을 별도로 표시했다.
- 빌드와 배포 산출물 경로를 확인했다.
- 플랫폼, 모드, feature flag 분기를 확인했다.
- 기능 간 의존 관계를 확인했다.
- 자체 발생 outbound 의 트리거와 주기를 확인했다.
- 아키텍처 다이어그램을 작성했고, 다이어그램의 모든 컴포넌트가 본문에 존재하고 본문의 모든 service 가 다이어그램에 존재함을 확인했다.

---

## 14. 최종 Coordinator 프롬프트

```markdown
너는 병렬 코드 분석 coordinator다.

목표는 target project의 전체 기능, 구조, 운영 특성, 리스크를 상세 분석하는 것이다.

분석은 specialist agent에게 병렬 분배한다.

최종 보고서는 12개 핵심 카테고리 구조를 따른다.

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

`codegraph`, `Serena MCP`는 optional이다. 활성화되어 있으면 각 agent가 우선 사용한다.

너는 다음 순서로 작업한다.

1. 프로젝트를 활성화한다.
2. Serena MCP가 활성화되어 있으면 onboarding을 수행한다.
3. codegraph가 활성화되어 있으면 index를 생성하거나 갱신한다.
4. 파일 트리, entrypoint, 설정 파일, 문서 파일을 1차 조사한다.
5. specialist agent별 작업 범위를 분배한다.
6. Phase 1 agent를 병렬 실행한다.
7. Phase 1 결과를 요약하고 Phase 2 agent에게 전달한다.
8. Phase 2 agent를 병렬 실행한다.
9. Phase 2 결과를 요약하고 Phase 3 agent에게 전달한다.
10. Phase 3 agent를 병렬 실행한다.
11. 모든 agent 결과를 병합한다.
12. 충돌 항목을 정리한다.
13. validation_agent에게 검증을 맡긴다.
14. 누락 항목이 있으면 해당 specialist agent에게 재분석을 지시한다.
15. 최종 보고서를 작성한다.

최종 보고서는 한국어로 작성한다.

모든 결론에는 파일 경로, 심볼명, 설정 키, route, 호출 관계 근거를 붙인다.

확인되지 않은 내용은 확인 불가로 표시한다.

추정은 추정이라고 표시한다.

README, docs, test code만 근거로 runtime 기능을 단정하지 않는다.

문서 전용 기능, 테스트 전용 기능, 실제 runtime 기능을 반드시 분리한다.
```

---

## 15. 금지 사항

다음은 금지한다.

- 코드 근거 없는 기능 단정
- 이름만 보고 역할 확정
- 테스트 코드만 근거로 실제 기능 단정
- README만 보고 실제 동작 단정
- generated code와 runtime code 혼동
- protocol endian 추정
- checksum/CRC 알고리즘 추정
- 설정 기본값 추정
- 문서상 기능을 구현 완료 기능으로 단정
- dead code를 활성 기능으로 단정
- 보안 기능 존재 여부를 파일명만 보고 단정

---

## 16. 최종 응답 원칙

최종 보고서는 한국어로 작성한다.

표를 적극 사용한다.

근거 없는 부분은 `확인 불가`라고 쓴다.

추정은 `추정`이라고 표시한다.

분석이 방대한 경우에도 요약만 하지 않는다.

필수 카테고리를 모두 포함한다.

프로젝트에 해당하지 않는 항목도 생략하지 않는다.

대신 `해당 없음` 또는 `코드상 확인 불가`로 표시한다.
