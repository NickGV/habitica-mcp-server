# Proposal: Harden MCP server for robustness (mcp-robustness)

## Intent

The 26-tool MCP server forwards unvalidated args to the Habitica API, has no 429 handling, leaks hardcoded Chinese error strings past i18n, and sends hardcoded `habitica-mcp-server-0.0.5` (drift risk with package.json). Agents get confusing errors and duplicated writes. Make failures clear, safe, and bilingual.

## Scope

### In Scope
- Real zod argument validation for all 26 tools; invalid args → bilingual error, NO clamping
- 429 interceptor: retry only GET (Retry-After + exponential backoff + jitter); writes fail cleanly, never auto-retried
- Route hardcoded errors (未知工具, Habitica API 错误) through `t()`
- x-client version derived from package.json
- Vitest suite with mocked axios

### Out of Scope
- No npm bump, no version bump, no changelog
- No breaking surface: tool names/inputSchemas unchanged
- No clamping/coercion, no new tools

## Capabilities

> Contract for sdd-spec. `openspec/specs/` is empty today — all new.

### New Capabilities
- `tool-input-validation`: zod schemas mirroring advertised inputSchemas; invalid args rejected before any Habitica call
- `api-rate-limit-handling`: 429 interceptor — GET retried (Retry-After, backoff, jitter); writes fail cleanly, never retried
- `bilingual-error-messages`: unknown-tool and API-error strings routed through t()
- `client-version-header`: x-client built from package.json at startup

### Modified Capabilities
- None (no existing specs)

## Approach

Single-file ESM. Schema map beside tool definitions; validate in handler before dispatch. Axios response interceptor: 429 + GET → retry honoring Retry-After, capped attempts; POST/PUT/DELETE → translated error. Read version via createRequire. Wrap error strings in t().

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `index.js` | Modified | zod validation, 429 interceptor, i18n errors, x-client |
| `package.json` | Modified | vitest dep; npm test runs vitest |
| `test/*.test.js` | New | unit tests with vi.mock('axios') |
| `i18n.js` | Unchanged | reused; already EN/zh-CN |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GET retry duplication | Med | only GET retried; Retry-After honored; jitter caps burst |
| Zod stricter than prior leniency | Med | schemas mirror inputSchemas |
| Interceptor masks non-429 | Low | non-429 passes through |

## Rollback Plan

Single-commit revert of index.js, package.json, test/. Restores hardcoded version, no interceptor, no validation. No migration.

## Dependencies

- zod ^3.22, axios ^1.6 already installed; vitest new devDependency; Node >=18 ESM.

## Success Criteria

- [ ] All 26 tools reject invalid args bilingual; zero API calls
- [ ] 429 GET honors Retry-After + backoff; writes never auto-retried
- [ ] x-client matches package.json version (tested)
- [ ] npm test green with mocked axios
- [ ] Tool names/inputSchemas unchanged; diff within 800-line budget