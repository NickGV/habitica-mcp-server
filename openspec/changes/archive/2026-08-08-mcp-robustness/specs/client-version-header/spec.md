# client-version-header — Delta Spec

> Change: `mcp-robustness` · NEW domain — `openspec/specs/client-version-header/` does not exist. On archive the `ADDED Requirements` below merge into a new main spec.

## Purpose

The axios client sends a hardcoded `x-client: habitica-mcp-server-0.0.5` header (index.js ~42). When `package.json` is version-bumped the header drifts (from source of truth) and agents behind the API lose accurate client identification. This spec builds `x-client` from `package.json` at startup, so the header always matches the released version without a code edit. No npm publication or version bump is part of this change.

## ADDED Requirements

### Requirement: x-client is derived from package.json

At startup the server SHALL read its own version from `package.json` using ESM-safe `createRequire` and set `x-client` to `habitica-mcp-server-{version}` on the shared axios instance. No hardcoded version literal (e.g. `0.0.5`) SHALL drive the header.

#### Scenario: Header matches package.json version

- **GIVEN** the deployed `package.json` declares `"version": "0.0.5"`
- **WHEN** the server starts
- **THEN** the axios defaults include `x-client: habitica-mcp-server-0.0.5`

#### Scenario: Version bump propagates automatically

- **GIVEN** an updated `package.json` declaring `"version": "0.1.0"`
- **WHEN** the server starts (no source edit)
- **THEN** the header is `habitica-mcp-server-0.1.0` — derived, not hand-edited in code

### Requirement: Header applies to every request

The `x-client` header SHALL be present on every outbound Habitica API request from the common axios instance, unchanged in casing/format.

#### Scenario: Header present on outbound call

- **GIVEN** a `get_tasks` call is dispatched
- **WHEN** the request headers are inspected
- **THEN** the `x-client` value matches `habitica-mcp-server-<version>`

## Non-Goals

No version bump, no npm publish, no changelog edit — runtime derivation only.