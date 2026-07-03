# Example output

## Target resolved
- `pkg/auth/service.py:118-144` `validate_session(token, ctx)`

## Reachability summary
- likely reachable

## Call paths
- `main -> FastAPI route POST /login -> LoginService.login -> validate_session`
- `pytest test_login.py -> LoginService.login -> validate_session` (test-only)

## Execution conditions
- route receives POST `/login`
- feature flag `AUTH_ENABLED` is true
- request body contains a token
- token parser returns a non-expired session

## Scenarios
1. API login flow
   - entry point: `POST /login`
   - trigger: request body contains `token`
   - condition: `AUTH_ENABLED=true`
   - confidence: high

2. Test harness
   - entry point: `tests/test_login.py`
   - trigger: unit test invocation
   - confidence: high

## Dead-code assessment
- Not dead. There is a direct runtime path from an API route.
- However, one alternate branch appears test-only.

## Unknowns / limits
- Session expiry logic depends on token contents not modeled in the repo.
