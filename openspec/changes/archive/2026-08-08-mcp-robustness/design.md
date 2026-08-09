# Design: Harden MCP server for robustness (mcp-robustness)

## Technical Approach

Single-file server stays; four focused additions plug into existing seams: (1) a zod schema map keyed by tool name, validated at `CallToolRequestSchema` entry before the switch; (2) an axios response interceptor that handles 429 with bounded, `Retry-After`-aware exponential backoff + jitter for GET only; (3) hardcoded Chinese error strings routed through `t()`; (4) `x-client` derived from `package.json` at startup. Schema and retry logic are extracted into `validation.js` and `retry.js` to keep the `index.js` diff within budget and make both testable in isolation. Matches the proposal approach and all four delta specs.

## Architecture Decisions

### Decision: Zod unknown-key policy
| Option | Tradeoff | Decision |
|--------|----------|----------|
| `z.object().passthrough()` | forwards extra keys to the API — spec says ignored | ✗ |
| `z.object().strict()` | rejects extras — breaking surface | ✗ |
| default `z.object()` strip | strips unknown keys, validation succeeds (v3 and v4 both default to strip) | **✓ — rely on default `.strip()`; never call `.strict()`/`.passthrough()`** |

No `.coerce()`/`.transform()` anywhere — invalid values rejected outright (spec: no clamping). Installed zod is 3.25.74; v3 strip semantics match the spec and are preserved in v4.

### Decision: Retry constants (named, exported from `retry.js`)
```js
export const RETRY = {
  MAX_RETRIES: 3,              // retries past first attempt => 4 total attempts (spec)
  RETRY_AFTER_CEILING_MS: 10_000, // cap on honored Retry-After
  BACKOFF_BASE_MS: 1_000,      // first backoff delay
  BACKOFF_MULTIPLIER: 2,       // exponential growth
  MAX_BACKOFF_MS: 8_000,       // cap = BASE * MULTIPLIER^MAX_RETRIES
  JITTER_RATIO: 0.5,           // uniform jitter spread
};
```
Delay rules: with `Retry-After` → `raw = min(retryAfterMs, ceiling)`, `delay = raw + uniform(0, raw*0.5)` (guarantees ≥ the honored, i.e. capped, `Retry-After` value). Without → `raw = min(base * 2^attempt, MAX_BACKOFF_MS)`, `delay = uniform(0, raw)` (full jitter, avoids retry storms). Non-numeric/negative `Retry-After` falls back to backoff.

### Decision: Clock injection
`sleep(ms)` wraps `setTimeout`; the interceptor factory accepts `{ sleep }` defaulting to it. Tests use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`, which intercept the global `setTimeout` — no wall-clock waits, no structural DI.

### Decision: Schema architecture
`validation.js` exports `toolSchemas` (plain object keyed by the 26 tool names, each mirroring its advertised `inputSchema`: same properties, enums, required/optional) and `validateArgs(name, args)`. In the handler, before the switch:

```js
const v = validateArgs(name, args ?? {});
if (!v.ok) throw new McpError(ErrorCode.InvalidParams, v.message);
args = v.data;                       // parsed (stripped) object; switch unchanged
```

### Decision: i18n structure
`i18n.js` unchanged (spec: reused). New strings are inline `t('en', 'zh')` calls matching the existing codebase pattern — no key dict. `validation.js` builds `t('Invalid arguments for tool "{name}": {issue}', '工具 "{name}" 参数无效: {issue}')` from the first zod issue (names field+received). Existing catch block switches to `t('Habitica API error: ', 'Habitica API 错误: ')`, `t('Unknown error', '未知错误')`, and the default branch to `t('Unknown tool: ', '未知工具: ')` + name.

### Decision: Version header
| Option | Tradeoff | Decision |
|--------|----------|----------|
| JSON import attribute | `with { type: 'json' }` unflagged only on Node ≥18.20/20.10; `assert` deprecated | ✗ (engines = `>=18.0.0`) |
| `createRequire` | works on every 18.x, zero flags | **✓** |

```js
const { version } = createRequire(import.meta.url)('./package.json');
// headers: 'x-client': `habitica-mcp-server-${version}`
```

### Decision: Module structure
| File | Action | Description |
|------|--------|-------------|
| `validation.js` | Create | 26 zod schemas + `validateArgs` + error formatting (keeps ~300 zod lines out of index.js) |
| `retry.js` | Create | `RETRY` constants, delay math, `sleep`, `createRateLimitInterceptor(client, { sleep })` |
| `test/validation.test.js` | Create | schema coverage, unknown-key strip, enums, required fields, bilingual errors |
| `test/retry.test.js` | Create | delay math + interceptor with scripted adapter + fake timers |
| `test/dispatch.test.js` | Create | zero-API-call on invalid args, unknown tool, no-arguments tool, x-client header |
| `vitest.config.js` | Create | `environment: 'node'`, `include: ['test/**/*.test.js']` |
| `index.js` | Modify | wire validation, interceptor, `t()` errors, createRequire version |
| `package.json` | Modify | `vitest` devDependency; `"test": "vitest run"` |

Mocks: no `vi.mock('axios')` needed — tests drive the real instance with a custom scripted `defaults.adapter` returning sequenced statuses (deterministic, no network, works for interceptor + dispatch tests).

## Data Flow

```
CallToolRequest ──> validateArgs(name, args ?? {}) ──invalid──> McpError(InvalidParams, t())
                        │ valid (stripped args)
                        ▼
                  switch(name) ──> tool fn ──> habiticaClient (axios)
                                                  │
                                   response interceptor:
                                   ├─ 429 + GET   → sleep(delay) → retry (≤4 attempts)
                                   ├─ 429 + POST/PUT/DELETE → t() rate-limit error (1 attempt)
                                   ├─ other 4xx/5xx → passthrough
                                   └─ 2xx          → passthrough
                                                  │
                                              catch ──> t('Habitica API error: ', ...)
```

## Interfaces / Contracts

```js
// retry.js
export function computeRetryDelay(attempt, retryAfterHeader, rand = Math.random): number
export function shouldRetry(config, response): boolean   // GET + 429 only
export function createRateLimitInterceptor(client, { sleep = defaultSleep } = {}): void

// validation.js
export const toolSchemas: Record<string, z.ZodType>
export function validateArgs(name, args): { ok: true, data } | { ok: false, message }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `computeRetryDelay` bounds (capped Retry-After ≤ ceiling; delay ≥ honored value via jitter; backoff exponential; jitter range), `shouldRetry` | injected `rand` seed; no timers |
| Integration | Interceptor: 429→429→200 recovers (3 attempts); 429 POST exactly 1 attempt; Retry-After honored; 500 & 200 passthrough | scripted axios adapter + `vi.advanceTimersByTimeAsync` |
| Unit | Validation: all 26 registered, extra keys stripped, out-of-enum rejected, string-vs-number rejected, empty args ok | `validateArgs` direct |
| Integration | Dispatch: invalid enum → zero HTTP requests; unknown tool; missing args | mocked adapter call counter |
| Unit | i18n: en / zh-CN / ja→en for the three error strings | `setLanguage` + call handler |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change only adds an HTTP response interceptor and argument validation.

## Migration / Rollout

No migration, no feature flag. Single PR. Rollback: revert `index.js`, `package.json`, `test/`, and delete `validation.js`/`retry.js`/`vitest.config.js`.

## Open Questions

- [ ] `RETRY_AFTER_CEILING_MS=10s` and `JITTER_RATIO=0.5` are design defaults (spec left values TBD) — flag if product tuning wanted. All other constants are spec-pinned.
