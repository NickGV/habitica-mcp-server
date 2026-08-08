import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { callToolHandler, habiticaClient } from '../index.js';
import { setLanguage } from '../i18n.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

function scriptedRequest({ name, args }) {
  const request = { params: { name } };
  if (args !== undefined) {
    request.params.arguments = args;
  }
  return request;
}

// Scripted adapter: records every outbound request and resolves 200.
function installOkAdapter() {
  const requests = [];
  habiticaClient.defaults.adapter = async (config) => {
    requests.push(config);
    return {
      data: { data: { id: 'task-1', text: 'ok' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  return requests;
}

// Scripted adapter that rejects with a Habitica-style API error carrying
// response.data.message (or a bare error with no message for the fallback).
function installFailingAdapter(message, { withResponse = true } = {}) {
  habiticaClient.defaults.adapter = async (config) => {
    if (!withResponse) {
      throw new Error(message);
    }
    return Promise.reject(
      new axios.AxiosError(
        'Request failed with status code 400',
        axios.AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        { data: { message }, status: 400, statusText: 'Bad Request', headers: {}, config }
      )
    );
  };
}

describe('dispatch validation (before any Habitica call)', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('rejects an invalid enum with ZERO outbound requests', async () => {
    const requests = installOkAdapter();

    await expect(
      callToolHandler(scriptedRequest({ name: 'get_tasks', args: { type: 'bogus' } }))
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });

    expect(requests).toHaveLength(0);
  });

  it('rejects a missing required field naming the field', async () => {
    const requests = installOkAdapter();

    const error = await callToolHandler(
      scriptedRequest({ name: 'add_checklist_item', args: { taskId: 'abc' } })
    ).catch((e) => e);

    expect(error.code).toBe(ErrorCode.InvalidParams);
    expect(error.message).toContain('text');
    expect(requests).toHaveLength(0);
  });

  it('rejects wrong-typed values without coercion', async () => {
    const requests = installOkAdapter();

    await expect(
      callToolHandler(scriptedRequest({ name: 'buy_item', args: { itemKey: 'x', quantity: '2' } }))
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });

    expect(requests).toHaveLength(0);
  });

  it('allows a no-argument tool with no arguments at all', async () => {
    const requests = installOkAdapter();

    const result = await callToolHandler(scriptedRequest({ name: 'get_user_profile' }));

    expect(requests).toHaveLength(1);
    expect(result.content[0].text).toContain('"id": "task-1"');
  });
});

describe('unknown tool (MethodNotFound, localized)', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('returns MethodNotFound in English by default', async () => {
    const error = await callToolHandler(
      scriptedRequest({ name: 'bogus_tool', args: {} })
    ).catch((e) => e);

    expect(error.code).toBe(ErrorCode.MethodNotFound);
    expect(error.message).toBe(`MCP error ${ErrorCode.MethodNotFound}: Unknown tool: bogus_tool`);
  });

  it('returns MethodNotFound in Chinese under zh-CN', async () => {
    setLanguage('zh-CN');
    const error = await callToolHandler(
      scriptedRequest({ name: 'bogus_tool', args: {} })
    ).catch((e) => e);

    expect(error.message).toBe(`MCP error ${ErrorCode.MethodNotFound}: 未知工具: bogus_tool`);
  });

  it('falls back to English for unsupported locales', async () => {
    setLanguage('ja');
    const error = await callToolHandler(
      scriptedRequest({ name: 'bogus_tool', args: {} })
    ).catch((e) => e);

    expect(error.message).toBe(`MCP error ${ErrorCode.MethodNotFound}: Unknown tool: bogus_tool`);
  });
});

describe('API error localization', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('prefixes Habitica API errors in English', async () => {
    installFailingAdapter('Bad Request');

    const error = await callToolHandler(
      scriptedRequest({ name: 'get_tasks', args: {} })
    ).catch((e) => e);

    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe(`MCP error ${ErrorCode.InternalError}: Habitica API error: Bad Request`);
  });

  it('prefixes Habitica API errors in Chinese under zh-CN', async () => {
    setLanguage('zh-CN');
    installFailingAdapter('Bad Request');

    const error = await callToolHandler(
      scriptedRequest({ name: 'get_tasks', args: {} })
    ).catch((e) => e);

    expect(error.message).toBe(`MCP error ${ErrorCode.InternalError}: Habitica API 错误: Bad Request`);
  });

  it('falls back to "Unknown error" (English) when no message exists', async () => {
    installFailingAdapter(undefined, { withResponse: false });

    const error = await callToolHandler(
      scriptedRequest({ name: 'get_tasks', args: {} })
    ).catch((e) => e);

    expect(error.code).toBe(ErrorCode.InternalError);
    expect(error.message).toBe(
      `MCP error ${ErrorCode.InternalError}: Habitica API error: Unknown error`
    );
  });
});

describe('x-client version header', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('sends x-client matching the package.json version on every request', async () => {
    const requests = installOkAdapter();

    await callToolHandler(scriptedRequest({ name: 'get_tasks', args: {} }));

    expect(requests).toHaveLength(1);
    expect(requests[0].headers['x-client']).toBe(`habitica-mcp-server-${pkg.version}`);
  });

  it('derives the header from package.json at startup (no hardcoded literal)', () => {
    const headers = habiticaClient.defaults.headers || {};
    // The header equals the template with the current package.json version
    // (which today is coincidentally 0.0.5 — the point is it is DERIVED).
    expect(headers['x-client']).toBe(`habitica-mcp-server-${pkg.version}`);
  });

  it('never hardcodes a version literal in the server source', () => {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/habitica-mcp-server-\d+\.\d+\.\d+/);
    expect(source).toMatch(/habitica-mcp-server-\$\{version\}/);
  });
});