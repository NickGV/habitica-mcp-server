# tool-input-validation

## Purpose

Every tool currently forwards arguments unvalidated to the Habitica API; invalid args yield confusing API errors and can cause duplicated/partial writes. This spec adds real zod validation for all 26 tools: schemas mirror the advertised `inputSchema`, invalid arguments are rejected BEFORE any Habitica call, values are never clamped or coerced, and validation failures are bilingual (EN default / zh-CN for `zh*` locales). Tool names and advertised `inputSchema` values remain unchanged.

## Requirements

### Requirement: Every tool has a zod schema mirroring its inputSchema

For each of the 26 tools a zod schema SHALL exist that mirrors the advertised `inputSchema`: same property types, same enums (`difficulty`/`priority` ∈ {0.1, 1, 1.5, 2}; `direction` ∈ {up, down}; `equip_item.type` ∈ {mount, pet, costume, equipped}; `get_shop.shopType` ∈ {market, questShop, timeTravelersShop, seasonalShop}; task `type` enums), same required fields (e.g. `create_task` requires `type`+`text`; `add_checklist_item` requires `taskId`+`text`), and same optional fields.

#### Scenario: All advertised tools have a registered schema

- GIVEN the server advertises 26 tool names via ListTools
- WHEN each name is checked against the validation schema map
- THEN each name maps to a zod schema whose properties, enums, and required list match that tool's advertised `inputSchema`

#### Scenario: Optional fields stay optional

- GIVEN `get_shop` is called without `shopType` (optional in `inputSchema`)
- WHEN arguments are validated
- THEN validation SHALL succeed and the call proceeds with the existing default behavior

#### Scenario: Undeclared extra keys do not break previously accepted calls

- GIVEN a call such as `create_task` including an extra key (`tags`) not declared in `inputSchema`
- WHEN validated
- THEN unknown keys MUST NOT cause rejection — they are ignored — preserving current leniency (no breaking-surface change)

### Requirement: Invalid arguments are rejected before any Habitica call

The tool handler SHALL validate `arguments` (empty object when absent) against the tool's schema BEFORE dispatching. On failure the server MUST NOT make any Habitica HTTP request and MUST return an error to the MCP client (no clamping, no partial execution).

#### Scenario: Invalid enum rejected with zero API calls

- GIVEN `get_tasks` called with `type: "bogus"`
- WHEN the handler validates
- THEN the call is rejected with a validation error
- AND the axios client records ZERO requests to `/tasks/user`

#### Scenario: Missing required field rejected

- GIVEN `add_checklist_item` called with only `taskId` and no `text`
- WHEN the handler validates
- THEN the call is rejected and the error identifies the missing `text` field

#### Scenario: No-argument tool with missing arguments object

- GIVEN `get_user_profile` called with no `arguments` at all
- WHEN validated
- THEN validation SHALL succeed (empty object treated as valid) and the call proceeds

### Requirement: No clamping or coercion of invalid values

Validation schemas SHALL NOT use zod coercion/transforms; invalid values MUST be rejected outright, never clamped into a legal value.

#### Scenario: out-of-enum numeric rejected

- GIVEN `create_task` with `difficulty: 3` (outside {0.1, 1, 1.5, 2})
- WHEN validated
- THEN rejected — NOT clamped down to 2

#### Scenario: Wrong-typed value rejected

- GIVEN `buy_item` with `quantity: "2"` (string while schema declares number)
- WHEN validated
- THEN rejected — NOT coerced into the number 2

### Requirement: Validation errors are bilingual and actionable

Validation errors SHALL be built with `t()`: English when locale does not start with `zh`, Simplified Chinese (`zh-CN`) when it does. Messages SHALL name the failing tool and field so an agent can correct the call.

#### Scenario: English locale

- **GIVEN** server locale `en` (default)
- **WHEN** `score_task` validation fails (missing `taskId`)
- **THEN** the returned error references the tool name and the `taskId` field in English

#### Scenario: Chinese locale

- **GIVEN** `MCP_LANG=zh-CN`
- **WHEN** the same `score_task` call fails validation
- **THEN** the returned error names the tool and `taskId` field with Chinese wording

## Non-Goals

No new tools, no `inputSchema` changes, no value coercion, no added strictness beyond declared schema (extra keys ignored).
