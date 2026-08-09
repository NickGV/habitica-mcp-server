# Archive Report: mcp-robustness

**Change**: mcp-robustness — Harden MCP server for robustness
**Archived**: 2026-08-08
**Artifact store**: openspec (filesystem)
**Archive destination**: `openspec/changes/archive/2026-08-08-mcp-robustness/`

## Verdict Reference

| Field | Value |
|-------|-------|
| Verify verdict | PASS WITH WARNINGS |
| CRITICAL findings | 0 |
| Requirements compliant | 14/14 |
| Scenarios compliant | 27/27 |
| Tests | 40/40 hermetic (no `HABITICA_*` env required) |
| Evidence hash | `sha256:0cd8a6b6493181e445f79e27bb2d94639b9a056fe330a993222f09cb2900f6b4` |
| Review gate | Verify report `next_recommended: archive`; no separate `.git` review store present to gate on. Or orchestrator-directed archive after PASS WITH WARNINGS. |

## What Was Archived

The complete SDD cycle for change `mcp-robustness` — 4 capability delta specs (14 requirements, 27 scenarios), design, 21/21 tasks, and a PASS WITH WARNINGS verification report. Delivered code: `validation.js` (26 zod schemas + `validateArgs`), `retry.js` (429 interceptor, bounded `Retry-After`-aware backoff), `index.js` wiring (validation gate, `t()` i18n errors, `createRequire`-derived `x-client`), plus `vitest.config.js` and 3 test files (40 tests).

## Syncs Performed (Delta Specs → Base Specs)

All 4 domains were **NEW** — `openspec/specs/{domain}/` did not exist, so each delta spec IS the full spec. Merged per OpenSpec convention: `## ADDED Requirements` normalized to `## Requirements`, transient "> Change: ..." header notes dropped, all requirements and scenarios preserved verbatim.

| Domain | Action | Requirements | Scenarios |
|--------|--------|--------------|-----------|
| `api-rate-limit-handling` | Created | 4 | 7 |
| `bilingual-error-messages` | Created (with drift fix #2) | 4 | 7 |
| `client-version-header` | Created | 2 | 3 |
| `tool-input-validation` | Created | 4 | 10 |
| **Total** | | **14** | **27** |

Base specs (source of truth):
- `openspec/specs/api-rate-limit-handling/spec.md`
- `openspec/specs/bilingual-error-messages/spec.md`
- `openspec/specs/client-version-header/spec.md`
- `openspec/specs/tool-input-validation/spec.md`

## Doc-Drift Resolutions (verify WARNING items)

Both verify-phase WARNINGs were documentation drift only (runtime behavior correct and tested). Resolved as part of this archive — spec/doc wording only, **no source code touched**.

1. **design.md:105 — Testing Strategy `Retry-After` ceiling claim**
   The table row claimed "`computeRetryDelay` bounds (Retry-After ≥ header, ≤ ceiling)". Reality (`retry.js:56-58`): the header is honored only up to the 10s ceiling via `Math.min(retryAfterMs, RETRY.RETRY_AFTER_CEILING_MS)`; the delay is `capped + jitter` where jitter ∈ [0, capped × 0.5], guaranteeing ≥ the honored (capped) value — not ≥ the raw header. Fixed wording to: "(capped Retry-After ≤ ceiling; delay ≥ honored value via jitter; backoff exponential; jitter range)". The constant definition at design.md:29 was already correct.

2. **bilingual-error-messages/spec.md:13 + tasks.md:53 — unknown-tool error code**
   Both documented `method-not-found` (MethodNotFound) for unknown tools. Delivered and tested behavior (`validation.js:140-146`, `index.js` validation gate, `dispatch.test.js:107-132`): unknown tool names are rejected by `validateArgs` **before dispatch** with `ErrorCode.InvalidParams` and a `t('Unknown tool: ', '未知工具: ')`-localized message. This was a sanctioned review decision (validation gate catches unknown tools). Applied:
   - Base spec `bilingual-error-messages/spec.md`: requirement now reads "SHALL be rejected by the validation gate before dispatch with an `InvalidParams` error carrying a `t()`-localized message..."; scenario WHEN clauses updated to "the validation gate rejects the unregistered name". THEN clauses and message text unchanged (verified identical by tests).
   - `tasks.md` task 4.5: "unknown tool → t() MethodNotFound" corrected to "unknown tool → t() InvalidParams (validation gate, not MethodNotFound)".

## Intentional Archive Notes

- Archive proceeded under the **intentional-with-warnings** policy: verify verdict PASS WITH WARNINGS, both WARNINGs were doc drift fixed during sync; no CRITICAL findings, no override of CRITICAL issues.
- No stale unchecked implementation tasks: all 21 tasks in `tasks.md` are `- [x]` (verified before sync).
- No destructive merges (all domains new; ADDED-only). `openspec/config.yaml` defines no `rules.archive` beyond defaults.
- Action context: no `workspace-planning` mode, no `allowedEditRoots` restriction — repo-local archive is in scope.

## Changelog (source-of-truth changes)

- `openspec/specs/api-rate-limit-handling/spec.md` — CREATED: 429 interception, bounded GET retry (≤4 attempts, Retry-After honored up to 10s ceiling, jitter), no auto-retry for state-changing writes, non-429 passthrough.
- `openspec/specs/bilingual-error-messages/spec.md` — CREATED: unknown-tool/API-error/fallback strings localized via `t()`; unknown tool → InvalidParams via validation gate; locale resolution unchanged (`i18n.js` untouched).
- `openspec/specs/client-version-header/spec.md` — CREATED: `x-client` derived from `package.json` at startup via `createRequire`; header on every outbound request.
- `openspec/specs/tool-input-validation/spec.md` — CREATED: 26 zod schemas mirroring advertised `inputSchema`; validation before any Habitica call; no clamping/coercion; bilingual actionable errors.

## Lessons Learned

1. **Deliberate design deviations must be reflected in the spec, not only in review minutes.** The unknown-tool InvalidParams decision was sanctioned by review but never written back into the delta spec, leaving `method-not-found` in the archive-bound docs. Future changes: when review approves a deviation, update the spec/tasks in the same phase to avoid archive-time drift reconciliation.
2. **Design tables can drift independently of constant definitions.** The `Retry-After` ceiling was corrected in the constants block but missed in the Testing Strategy table — same fact documented twice is two places to maintain. Prefer referencing a single source (constants block) over re-stating numeric behavior in tables.
3. **OpenSpec archive for NEW domains is a pure promotion**: delta spec → base spec with only heading normalization; requirement/scenario counts verify mechanically (14 reqs, 27 scenarios) against the verify report's compliance matrix — a strong completeness check.
4. **Verification evidence quality was high** (hermetic 40-test suite, per-scenario compliance matrix) which made the doc-drift classification unambiguous — doc drift vs. behavior drift.

## Final Change State

- ✅ Base specs synced (4 domains, 14 requirements, 27 scenarios)
- ✅ Change folder moved to `openspec/changes/archive/2026-08-08-mcp-robustness/`
- ✅ Archive contains proposal, 4 delta specs, design (drift-fixed), tasks (21/21, drift-fixed), verify-report, archive-report
- ✅ Active `openspec/changes/` no longer lists `mcp-robustness`
- ✅ SDD cycle complete — ready for the next change
