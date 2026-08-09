# bilingual-error-messages — Delta Spec

> Change: `mcp-robustness` · NEW domain — `openspec/specs/bilingual-error-messages/` does not exist. On archive the `ADDED Requirements` below merge into a new main spec.

## Purpose

Three error strings in `index.js` currently bypass the i18n helper and always render in Chinese: the unknown-tool message `未知工具: ${name}` (index.js:579), the API failure prefix `Habitica API 错误: ` (index.js:587), and the fallback `未知错误` (index.js:586). English-locale agents therefore receive untranslated Chinese errors. This spec routes those strings through the existing `t()` from `i18n.js` (EN default, `zh*` → Simplified Chinese). `i18n.js` itself is unchanged.

## ADDED Requirements

### Requirement: Unknown-tool message is localized

The handler's default branch for an unregistered tool name SHALL raise the method-not-found error with a `t()`-localized message of the form `Unknown tool: {name}` / `未知工具: {name}`.

#### Scenario: Unknown tool in English

- **GIVEN** locale is `en` (default) and an unregistered name `bogus_tool` is called
- **WHEN** the handler hits the unknown-tool branch
- **THEN** the error message SHALL read `Unknown tool: bogus_tool` (English)

#### Scenario: Unknown tool in Chinese

- **GIVEN** `MCP_LANG=zh-CN` and the same `bogus_tool` call
- **WHEN** the handler hits the unknown-tool branch
- **THEN** the error message SHALL read `未知工具: bogus_tool`

### Requirement: API-error prefix is localized

The error wrapper produced for a failing Habitica call SHALL prefix the upstream message (`error.response.data.message` or `error.message`) with `t('Habitica API error: ', 'Habitica API 错误: ')`. The underlying detail text passes through untouched.

#### Scenario: API failure in English

- **GIVEN** locale `en` and a Habitica call failing with `message: "Bad Request"`
- **WHEN** the error is wrapped
- **THEN** the message SHALL read `Habitica API error: Bad Request`

#### Scenario: API failure in Chinese

- **GIVEN** `MCP_LANG=zh-CN` and the same failure
- **WHEN** the error is wrapped
- **THEN** the message SHALL read `Habitica API 错误: Bad Request`

### Requirement: Unknown-error fallback is localized

When no upstream message exists (`error?.data?.message` and `error.message` both absent), the fallback string SHALL be `t('Unknown error', '未知错误')` instead of a hardcoded Chinese literal.

#### Scenario: Fallback in English

- **GIVEN** locale `en` and an error carrying no `message` value
- **WHEN** the fallback string is selected
- **THEN** the error SHALL contain the English text (not 未知错误)

#### Scenario: Fallback in Chinese

- **GIVEN** `MCP_LANG=zh-CN` and an error carrying no `message` value
- **WHEN** the fallback string is selected
- **THEN** the error SHALL read `未知错误`

### Requirement: Locale resolution is unchanged

Localization resolution SHALL keep using `i18n.js`: `MCP_LANG` falling back to `LANG`, `zh*` prefixes producing Simplified Chinese, everything else English. Only EN and zh-CN outputs are produced — no additional locales.

#### Scenario: Unsupported locale falls back to English

- **GIVEN** `MCP_LANG=ja` (unsupported)
- **WHEN** an error string is rendered
- **THEN** the English variant is produced