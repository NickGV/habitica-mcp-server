## Exploration: mcp-robustness

### Current State
The Habitica MCP server is a single-file Node.js ESM application (~972 lines) with 26 MCP tools. It uses `@modelcontextprotocol/sdk` v0.5.0, axios for HTTP, dotenv for config, and zod (imported but **never used**). The `inputSchema` objects in tool definitions are plain JSON descriptions for LLM advertisement only — runtime arguments are passed raw to Habitica API without validation.

Key issues identified:
- **Line 42**: Hardcoded `'habitica-mcp-server-0.0.5'` for `x-client` header (package.json has version `0.0.5`)
- **Lines 579, 586**: Hardcoded Chinese error messages (`未知工具`, `Habitica API 错误`) bypassing the `t()` i18n helper
- **No rate-limit handling**: Habitica enforces ~30 requests/10 seconds per user (HTTP 429 with `Retry-After` header)
- **No tests**: `npm test` is a stub (`echo "No tests specified" && exit 0`)

### Affected Areas
- `index.js` — Tool registry (lines 61-485), CallToolRequestSchema handler (lines 495-589), all 26 tool implementations, `habiticaClient` axios instance, `runServer()`
- `package.json` — Dependencies, scripts, version field
- `i18n.js` — Translation helper (may need new keys for error messages)
- New test files — Unit/integration tests for validation, error mapping, rate-limit retry, tool dispatch

### Approaches

#### 1. Real Argument Validation with Zod
| Approach | Description | Pros | Cons | Effort |
|----------|-------------|------|------|--------|
| **A: Single source of truth** | Define zod schemas once, derive both `inputSchema` (via `zod-to-json-schema`) and runtime validation from them | DRY, always in sync, type-safe | Extra dependency (`zod-to-json-schema`), build step or runtime conversion | Medium |
| **B: Separate zod schemas** | Keep `inputSchema` as-is, write parallel zod schemas for validation only | Simple, no new deps, explicit control | Duplication risk, schemas can drift | Low |
| **C: Inline zod.parse()** | Call `schema.parse(args)` at start of each tool function | Minimal change, colocated | Very verbose (26 tools), repetitive | Low |

#### 2. Rate-Limit Handling (HTTP 429)
| Approach | Description | Pros | Cons | Effort |
|----------|-------------|------|------|--------|
| **A: Axios interceptor** | Add response interceptor to `habiticaClient` that detects 429, reads `Retry-After`, waits, retries with exponential backoff + jitter | Centralized, transparent to tool code, respects server headers | Must handle non-idempotent POST/PUT/DELETE carefully | Medium |
| **B: Wrapper function** | Create `habiticaRequest(fn)` wrapper that wraps each axios call with retry logic | Explicit control per call, can skip for non-idempotent | More verbose, easy to forget | Medium |
| **C: axios-retry library** | Use `axios-retry` package with custom retry condition | Battle-tested, configurable | Extra dependency, less control over backoff | Low |

#### 3. Fix Hardcoded Chinese Error Messages
| Approach | Description | Pros | Cons | Effort |
|----------|-------------|------|------|--------|
| **A: Route through `t()`** | Replace hardcoded strings with `t('en', 'zh')` calls, add keys to i18n | Consistent with rest of codebase, MCP_LANG works | Need to add translation keys | Low |
| **B: Extract to constants** | Define error message constants using `t()` at module load | Slightly cleaner | Same i18n requirement | Low |

#### 4. Read x-client Version from package.json
| Approach | Description | Pros | Cons | Effort |
|----------|-------------|------|------|--------|
| **A: Dynamic import** | `import pkg from '../package.json' assert { type: 'json' }` (Node 18+) | Always in sync, zero maintenance | Requires Node 18+ (already satisfied) | Low |
| **B: fs.readFileSync** | Read and parse package.json at startup | Works on older Node | More verbose | Low |

#### 5. Test Framework Selection
| Framework | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Vitest** ⭐ | Native ESM, fast (Vite-powered), Jest-compatible API, excellent `vi.mock()` for axios, built-in UI, TypeScript support, watch mode | ~15MB deps | **Recommended** — modern Node ESM projects |
| **node:test** | Zero deps, ships with Node 18+, fast, native | No watch mode (until Node 23), no snapshot testing, limited matchers, no UI | Tiny libraries, zero-dep philosophy |
| **Jest** | Mature, huge ecosystem, snapshot testing | Slow, ESM config complexity (~babel/ts-jest), ~50MB deps | React Native, legacy codebases |

### Recommendation
1. **Validation**: Approach B (separate zod schemas) — pragmatic balance. Define zod schema per tool, validate at handler entry before dispatch. Use `zod-to-json-schema` only if we later want to auto-generate `inputSchema`.
2. **Rate-limit**: Approach A (axios interceptor) — centralized, respects `Retry-After` header, exponential backoff with jitter. Add `idempotency-key` header for non-GET retries.
3. **i18n**: Approach A — add `t()` calls with new keys `errors.unknownTool` and `errors.habiticaApi`.
4. **Version**: Approach A — dynamic `import` of package.json with `assert { type: 'json' }`.
5. **Tests**: **Vitest** — best DX for ESM + axios mocking. Install `vitest`, `@vitest/coverage-v8`, `msw` (for HTTP mocking). Target coverage: validation paths, 429 retry logic, error mapping, all 26 tool dispatches.

### Risks
- **Non-idempotent retry danger**: POST/PUT/DELETE retries on 429 can cause duplicate actions. Must add idempotency keys or restrict retry to GET only.
- **Zod schema drift**: Separate zod schemas (Approach B) can diverge from `inputSchema`. Mitigate with code review discipline or later migrate to Approach A.
- **Vitest config complexity**: ESM + TypeScript (if added) + MSW setup requires initial config time.
- **Axios interceptor scope**: Interceptor retries ALL 429s — may need per-request opt-out for non-idempotent calls.

### Ready for Proposal
**Yes**. All five scope items have clear recommended approaches with identified tradeoffs. The orchestrator should proceed to `sdd-propose` with this exploration as input.