# api-rate-limit-handling — Delta Spec

> Change: `mcp-robustness` · NEW domain — `openspec/specs/api-rate-limit-handling/` does not exist. On archive the `ADDED Requirements` below merge into a new main spec.

## Purpose

The Habitica API rate-limits per user (~30 requests/10s) and answers with HTTP 429 plus a `Retry-After` header. The server currently surfaces raw 429s as generic errors, so agents retry manually and can duplicate state-changing writes (double task creation, double purchase). This spec makes the axios client handle 429 responses: safe GET requests are retried with bounded, `Retry-After`-aware exponential backoff + jitter; state-changing requests (POST/PUT/DELETE) fail cleanly and are NEVER auto-retried; every non-429 status passes through untouched.

## ADDED Requirements

### Requirement: 429 responses are intercepted

The axios instance SHALL register an interceptor that recognizes every HTTP 429 response from the Habitica API and routes it through the retry policy below.

#### Scenario: 429 observed on a request

- **WHEN** a response with status 429 arrives
- **THEN** the interceptor SHALL classify it as rate-limited and apply the appropriate policy by HTTP method

### Requirement: GET requests are retried with bounded exponential backoff

A 429 on a GET request SHALL be retried up to maxRetries (default 3 retries ⇒ 4 total attempts). The delay between attempts SHALL honor the `Retry-After` header when present (bounded by a maximum ceiling) and otherwise grow exponentially per attempt; all delays SHALL include jitter to avoid retry-storms. A successful retry returns the normal response to the caller.

#### Scenario: Transient 429 recovers on retry

- **GIVEN** the API returns 429, then 429, then 200 for `/tasks/user`
- **WHEN** a `get_tasks` call is made
- **THEN** the caller receives the final 200 payload
- **AND** exactly 3 HTTP attempts are recorded (2 retries)

#### Scenario: Retry-After is honored

- **GIVEN** a 429 GET response with `Retry-After: 2` (≤ ceiling)
- **WHEN** the retry scheduler delays the next attempt
- **THEN** the delay SHALL be at least the Retry-After value (bounded by the ceiling), not the raw backoff

#### Scenario: Retries exhausted

- **GIVEN** four consecutive 429 responses to a GET request
- **WHEN** the 4th attempt also returns 429
- **THEN** the request SHALL fail with a bilingual, actionable error (rate limit still exceeded; no further attempts)

### Requirement: State-changing requests are never auto-retried

For any non-GET request (POST / PUT / DELETE) receiving 429, the server SHALL NOT issue additional attempts and SHALL return a clean bilingual error saying the rate limit was reached. This MUST prevent duplicate writes (e.g. a second `POST /tasks/user` or repeated purchase).

#### Scenario: POST 429 fails without a retry

- **GIVEN** `create_task` posts to `/tasks/user` which responds 429
- **WHEN** the request is made
- **THEN** the caller receives a bilingual rate-limit error
- **AND** exactly 1 HTTP attempt is recorded — no retry, no duplicate write

### Requirement: Non-429 statuses pass through

The interceptor SHALL leave statuses other than 429 untouched: 2xx responses flow to the caller unchanged; 4xx (excluding 429) and 5xx propagate as normal axios errors without any retry or rescheduling.

#### Scenario: 500 passes through without retry

- **GIVEN** a GET to `/tasks/user` returns a single 500
- **WHEN** the response is processed
- **THEN** the error propagates to normal error handling and NO retry attempt is made

#### Scenario: 2xx passes through unchanged

- **GIVEN** a GET to `/tasks/user` returns 200
- **WHEN** the response is processed
- **THEN** the payload is delivered to the caller unmodified