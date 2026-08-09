# Tasks: Harden MCP server for robustness (mcp-robustness)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900 (range 850–950) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR, 4 work-unit commits |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

> Session review budget = 800 lines. Forecast ≈900 (validation.js ~300, retry.js ~110, index.js ~55, 3 test files ~420, vitest.config/package.json ~15) → single-PR `size:exception` sign-off is REQUIRED before sdd-apply.

### Work Units (commit order)

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| 1 test-infra | `vitest.config.js` + `package.json` runner | `npx vitest --version`; `npm test` | N/A — no tests exist yet; runner bootstrap only | revert package.json, delete vitest.config.js |
| 2 retry | `retry.js` + `test/retry.test.js` | `npx vitest run test/retry.test.js` | N/A — scripted axios adapter + fake timers, no network | delete `retry.js` + its test |
| 3 validation | `validation.js` + `test/validation.test.js` | `npx vitest run test/validation.test.js` | N/A — pure function, no network | delete `validation.js` + its test |
| 4 integration | `index.js` wiring + `test/dispatch.test.js` | `npm test` (full suite) | N/A live smoke — needs real Habitica creds; suites cover | revert index.js + dispatch test; interceptor/validation unplug |

## Phase 1: Test Infrastructure
- [x] 1.1 Create `vitest.config.js` — `environment: 'node'`, `include: ['test/**/*.test.js']`
- [x] 1.2 Add `vitest` devDependency (`npm i -D vitest`)
- [x] 1.3 Replace stub in `package.json` scripts: `"test": "vitest run"`
- [x] 1.4 Verify `npm test` invokes vitest (early no-tests exit OK at this stage)

## Phase 2: retry.js — 429 Interceptor Module
- [x] 2.1 `retry.js`: export `RETRY` = { MAX_RETRIES: 3, RETRY_AFTER_CEILING_MS: 10_000, BACKOFF_BASE_MS: 1_000, BACKOFF_MULTIPLIER: 2, MAX_BACKOFF_MS: 8_000, JITTER_RATIO: 0.5 }
- [x] 2.2 `sleep(ms)` setTimeout wrapper; `computeRetryDelay(attempt, retryAfterHeader, rand = Math.random)` — header: `min(h,10s) + uniform(0, raw*0.5)`; absent: full jitter `uniform(0, min(1s*2^attempt, 8s))`
- [x] 2.3 `shouldRetry(config, response)`: true only when `method==='get' && status===429`; non-numeric/negative header falls back to backoff
- [x] 2.4 `createRateLimitInterceptor(client, { sleep = defaultSleep } = {})`: GET 429 replay ≤4 attempts then bilingual `t()` rate-limit error; POST/PUT/DELETE 429 → 1 attempt, bilingual error, NEVER retry; non-429 passthrough
- [x] 2.5 `test/retry.test.js`: seeded `rand` bounds (delay ≥ header, ≤ ceiling, jitter in range); 429→429→200 recovers in exactly 3 attempts; POST 429 = exactly 1 attempt; 500/200 no retry — via `vi.useFakeTimers()` + scripted adapter

## Phase 3: validation.js (26 Schemas)
- [x] 3.1 `validation.js`: `toolSchemas` — plain object keyed by 26 tool names; each zod schema mirrors its advertised `inputSchema` (same props/enums/required; optional stay optional; never `.strict()/.passthrough()/.coerce()`)
- [x] 3.2 `validateArgs(name, args)`: `args ?? {}` → `safeParse` (strip unknown keys) → `{ok:true, data}` or `{ok:false, message: t('Invalid arguments for tool "{name}": {issue}', '工具 "{name}" 参数无效: {issue}')}` naming tool+field+received
- [x] 3.3 `test/validation.test.js`: all 26 registered; extra key `tags` ignored; `difficulty:3` rejected NOT clamped; `quantity:"2"` rejected NOT coerced; missing `text` names field; no-args `get_user_profile` passes

## Phase 4: index.js Integration
- [x] 4.1 Import `validateArgs`/`toolSchemas` + `createRateLimitInterceptor`; wire interceptor onto `habiticaClient` at startup
- [x] 4.2 In `CallToolRequestSchema`, BEFORE the switch: `v = validateArgs(name, args ?? {})`; `!v.ok` → `McpError(InvalidParams, v.message)`; else `args = v.data` (switch untouched)
- [x] 4.3 t() routing: default branch `t('Unknown tool: ', '未知工具: ')`+name; catch prefix `t('Habitica API error: ', 'Habitica API 错误: ')`; fallback `t('Unknown error', '未知错误')` (i18n.js unchanged)
- [x] 4.4 `x-client`: `const { version } = createRequire(import.meta.url)('./package.json')` → header `habitica-mcp-server-${version}`; remove literal `0.0.5`
- [x] 4.5 `test/dispatch.test.js` (scripted adapter): invalid enum → ZERO outbound requests; missing field → InvalidParams naming field; unknown tool → t() InvalidParams (validation gate, not MethodNotFound); outbound `x-client` matches package.json version; en / zh-CN / ja→en variants

## Phase 5: Verification & Review Guard
- [x] 5.1 `npm test` — full suite green (validation + retry + dispatch)
- [x] 5.2 `git diff --stat` before commit: if `additions+deletions` > 800 → PAUSE, record `size:exception` approval (single-pr delivery)
- [x] 5.3 Confirm advertised tool names + `inputSchema` unchanged (surface contract)
- [x] 5.4 Amend per work-unit-commits: 4 Conventional Commits (test-infra, retry, validation, integration); tests+code together; message = outcome not file list