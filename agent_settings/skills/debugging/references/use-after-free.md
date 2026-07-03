---
name: use-after-free-guide
description: Use-after-free (UAF) 및 dangling pointer 버그의 진단과 수정 가이드라인. AI agent에게 메모리 안전성 버그 수정을 위임할 때 band-aid 수정(NULL 체크 추가, 역참조 직전 방어 코드)을 방지하고 근본 원인(lifetime 관리, 소유권 모델, 동기화 구조)을 수정하도록 강제한다. use-after-free, dangling pointer, double free, 삭제된 객체 역참조, 멀티스레드 메모리 버그, SIGSEGV, SIGABRT, heap-use-after-free (ASan), 또는 "이미 해제된 포인터" 관련 버그가 언급될 때 이 스킬을 사용하라. 사용자가 AI agent에게 내릴 지침을 요청하거나, 직접 UAF 버그를 수정할 때도 트리거한다.
---

# Use-After-Free Debugging Guide

멀티스레드 환경의 use-after-free(UAF) 버그를 근본 원인부터 해결하기 위한 가이드라인.

## 이 스킬이 존재하는 이유

UAF 버그를 AI agent에게 위임하면, agent는 최소 변경 편향(minimal-change bias)에 따라 역참조 직전에 NULL 체크를 추가하는 식으로 수정하려 한다. 이것은 크래시를 숨길 뿐 근본 원인을 해결하지 않으며, 오히려 상태 불일치를 조용히 전파시켜 더 어려운 버그를 만든다.

이 스킬은 **band-aid 수정을 명시적으로 금지**하고, **객체 lifetime 분석 → 소유권/동기화 재설계 → 구조적 검증** 순서를 강제한다.

---

## 금지 패턴 (Anti-patterns)

다음 수정 방식은 UAF의 올바른 해결이 아니다. 제안하거나 적용하지 말라.

### 1. NULL 체크 방어
```cpp
// ❌ 금지: 크래시만 숨김, 삭제된 포인터는 NULL이 아닐 수 있음
if (ptr != nullptr) {
    ptr->doSomething();
}
```
- 삭제된 포인터는 NULL이 보장되지 않는다 (undefined behavior).
- NULL이더라도 "접근하지 않는 것"이 올바른 동작인지 검증되지 않았다.
- 실행이 계속되면서 불완전한 상태가 다른 코드로 전파된다.

### 2. 삭제 직후 NULL 대입만 추가
```cpp
// ❌ 불충분: race condition을 해결하지 않음
delete obj;
obj = nullptr;  // 다른 스레드가 delete와 이 줄 사이에 접근하면 동일한 UAF
```

### 3. try-catch로 감싸기
```cpp
// ❌ 금지: UAF는 예외가 아니라 undefined behavior
try {
    ptr->doSomething();
} catch (...) {
    // UAF는 여기 도달하기 전에 이미 UB
}
```

### 4. flag 변수로 유효성 추적
```cpp
// ❌ 불충분: flag 자체도 race condition 대상
bool isValid = true;
// Thread A: isValid = false; delete obj;
// Thread B: if (isValid) obj->doSomething();  // TOCTOU race
```

---

## 진단 절차

수정 코드를 작성하기 **전에** 반드시 아래 분석을 완료하라.

### Step 1: Lifetime 매핑

해당 객체의 전체 lifecycle을 시간순으로 정리한다:

```
LIFETIME MAP
────────────
Object: <타입과 역할>
Creation:    <어디서, 어떤 스레드가 생성하는가>
Ownership:   <누가 소유하는가 — 단일 소유 / 공유 소유 / 불명확>
References:  <어떤 스레드/컴포넌트가 포인터를 보유하는가>
Deletion:    <어디서, 어떤 스레드가 삭제하는가>
UAF point:   <삭제 이후 어떤 스레드가 역참조하는가>
```

### Step 2: Race Condition 식별

삭제와 접근 사이의 경쟁 조건을 구체적으로 기술한다:

```
RACE CONDITION
──────────────
Thread A: <삭제 경로 — 함수 호출 체인>
Thread B: <접근 경로 — 함수 호출 체인>
Ordering:  <어떤 동기화가 있는가 / 없는가>
Window:    <race가 발생하는 시간 구간>
```

### Step 3: 소유권 모델 판정

현재 코드의 소유권 모델을 판정한다:

| 현재 상태 | 의미 |
|-----------|------|
| 소유자 명확, 참조자 존재 | 참조자에게 소유자보다 먼저 또는 동시에 무효화 통지 필요 |
| 소유자 불명확 | 소유권 자체를 재설계해야 함 |
| 공유 소유 | 참조 카운팅 또는 명시적 lifetime 관리 필요 |
| 전역/싱글턴 | 종료 순서(destruction order) 문제 가능성 |

---

## 수정 전략

진단 결과에 따라 아래 전략 중 적절한 것을 선택한다. **두 가지 이상 조합이 필요할 수 있다.**

### Strategy A: 소유권 기반 Lifetime 관리

`shared_ptr` / `weak_ptr` 패턴을 사용하여 참조가 남아있는 동안 삭제를 방지한다.

```cpp
// 소유자: shared_ptr 보유
std::shared_ptr<Session> session = std::make_shared<Session>();

// 참조자: weak_ptr 보유 → lock()으로 안전하게 접근
std::weak_ptr<Session> sessionRef = session;

// 접근 시
if (auto s = sessionRef.lock()) {
    s->doSomething();  // shared_ptr이 유효한 동안 삭제 불가
}
// lock() 실패 = 이미 삭제됨 → 자연스럽게 스킵 (이것은 NULL 체크와 다름)
```

**NULL 체크와의 차이:** `weak_ptr::lock()`은 원자적이고 참조 카운트와 결합되어 있어, 체크와 사용 사이에 race가 없다. raw pointer NULL 체크는 TOCTOU 문제가 있다.

**적합한 경우:** 객체를 여러 스레드에서 공유하며, 참조자가 객체 소멸 이후에도 존재할 수 있는 구조.

### Strategy B: 삭제 시점 지연 (Deferred Destruction)

참조자가 모두 해제된 후에만 삭제가 발생하도록 보장한다.

- 이벤트 루프 기반: 삭제 요청을 다음 이벤트 루프 사이클로 지연
- 에포크 기반(RCU 패턴): grace period 이후에만 메모리 회수
- Reference counting: 수동 참조 카운트 관리

**적합한 경우:** 삭제 시점을 호출자가 제어할 수 있고, 즉시 삭제가 필수가 아닌 경우.

### Strategy C: 동기화 구조 재설계

접근과 삭제가 동시에 발생할 수 없도록 동기화를 추가하거나 구조를 변경한다.

- Mutex로 접근/삭제 직렬화
- Read-write lock으로 읽기 병렬성 유지하면서 삭제는 배타적으로
- 메시지 패싱으로 직접 공유를 제거

**적합한 경우:** 객체 접근 패턴이 명확하고, lock contention이 수용 가능한 경우.

### Strategy D: 아키텍처 변경

포인터 공유 자체를 제거한다.

- 객체를 복사하여 각 스레드에 독립 인스턴스 제공
- Handle/ID 기반 간접 참조 (handle → lookup table → object)
- Arena/pool allocator로 lifetime을 일괄 관리

**적합한 경우:** 공유 자체가 설계 결함인 경우, 또는 위 전략들이 복잡성 대비 효과가 없는 경우.

---

## 검증 기준

수정이 완료되면 아래 기준을 충족하는지 확인한다.

### 필수 검증

1. **구조적 불가능성:** 삭제된 객체에 접근하는 코드 경로가 구조적으로 존재할 수 없음을 설명할 수 있는가? 단순히 "NULL이면 스킵"이 아니라, 삭제와 접근 사이의 race가 제거되었는가?

2. **Lifetime 증명:** 새로운 소유권 모델에서, 모든 참조자의 lifetime이 객체의 lifetime 내에 포함되거나, 객체 소멸을 안전하게 감지할 수 있는가?

3. **동시성 안전:** 수정된 동기화 구조에서 deadlock, priority inversion, 또는 새로운 race condition이 도입되지 않았는가?

### 도구 활용 검증

가능한 경우 아래 도구를 사용하여 추가 검증한다:

- **AddressSanitizer (ASan):** `-fsanitize=address` — heap-use-after-free 감지
- **ThreadSanitizer (TSan):** `-fsanitize=thread` — data race 감지
- **Valgrind:** `--tool=memcheck` — 메모리 오류 감지
- **Helgrind:** `--tool=helgrind` — lock ordering 문제 감지

```bash
# ASan 빌드 예시
g++ -fsanitize=address -g -O1 -o test_binary test.cpp
./test_binary  # UAF 발생 시 상세 보고 출력

# TSan 빌드 예시
g++ -fsanitize=thread -g -O1 -o test_binary test.cpp
./test_binary  # data race 발생 시 상세 보고 출력
```

---

## Rust 환경에서의 UAF

Rust의 소유권 시스템은 컴파일 타임에 대부분의 UAF를 방지하지만, `unsafe` 블록 내에서는 동일한 문제가 발생할 수 있다.

### Rust에서 UAF가 발생하는 경우
- `unsafe` 블록 내 raw pointer 사용 (`*const T`, `*mut T`)
- FFI 경계에서 C/C++ 라이브러리와 포인터 교환
- `Pin`을 오용하여 self-referential struct의 참조가 무효화됨
- `Arc`/`Weak` 없이 스레드 간 참조 공유 (unsafe 경유)

### Rust에서의 수정 방향
- `unsafe` 범위를 최소화하고, safe abstraction으로 감싸라
- FFI 경계에서는 `Arc`를 통해 소유권을 Rust 쪽에서 관리하라
- raw pointer 대신 `&T`, `Arc<T>`, `Weak<T>`를 사용할 수 있는지 먼저 검토하라

---

## AI Agent에게 위임 시 지침 템플릿

UAF 버그 수정을 AI agent에게 위임할 때, 다음 지침을 함께 전달하라:

```markdown
## UAF 수정 지침

1. 이 버그는 use-after-free (dangling pointer dereference)이다.
2. **금지 수정:** 역참조 직전 NULL 체크, 삭제 후 NULL 대입만, try-catch 감싸기,
   flag 변수 유효성 추적. 이들은 증상을 숨길 뿐 근본 원인을 해결하지 않는다.
3. 수정 전에 반드시 다음을 분석하라:
   - 해당 객체의 생성 → 소유 → 참조 → 삭제 → 역참조 시점 (Lifetime Map)
   - 삭제 스레드와 접근 스레드 사이의 race condition
   - 현재 소유권 모델의 문제점
4. 소유권 모델 또는 동기화 구조를 변경하여, 삭제된 객체에 접근하는 경로 자체가
   구조적으로 존재할 수 없도록 수정하라.
5. 수정 후, 해당 race condition이 구조적으로 제거되었음을 증명하라.
   "NULL이면 스킵한다"는 증명이 아니다.
```

---

## bug-hunter 스킬과의 관계

이 스킬은 `bug-hunter`의 Reproduce → Hypothesize → Verify 루프를 대체하지 않는다. UAF 버그에 특화된 **진단 심화 + 수정 방향 제한**을 제공한다.

- **bug-hunter Stage 2 (Hypothesize)** 에서 이 스킬의 진단 절차(Lifetime Map, Race Condition 식별)를 사용하라.
- **bug-hunter Stage 3 (Verify)** 에서 이 스킬의 검증 기준(구조적 불가능성, Lifetime 증명)을 사용하라.
- 수정 전략 선택은 Hypothesize 단계에서 가설과 함께 결정한다.
