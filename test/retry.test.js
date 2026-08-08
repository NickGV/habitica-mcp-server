import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { setLanguage } from '../i18n.js';
import {
  RETRY,
  computeRetryDelay,
  shouldRetry,
  createRateLimitInterceptor,
} from '../retry.js';

// Scripted axios adapter: replays a fixed plan of { status, headers }
// responses and records every outbound request config.
function createScriptedClient(plan) {
  const client = axios.create({ baseURL: 'https://habitica.example/api/v3' });
  const requests = [];
  let index = 0;

  client.defaults.adapter = async (config) => {
    requests.push(config);
    const step = plan[Math.min(index, plan.length - 1)];
    index += 1;

    if (step.status >= 200 && step.status < 300) {
      return {
        data: { ok: true, attempt: index },
        status: step.status,
        statusText: 'OK',
        headers: {},
        config,
      };
    }

    const response = {
      data: {},
      status: step.status,
      statusText: 'Error',
      headers: step.headers || {},
      config,
    };
    return Promise.reject(
      new axios.AxiosError(
        `Request failed with status code ${step.status}`,
        axios.AxiosError.ERR_BAD_REQUEST,
        config,
        null,
        response
      )
    );
  };

  return { client, requests };
}

describe('computeRetryDelay', () => {
  it('honors Retry-After at least as long as the header, capped by the ceiling', () => {
    // rand 0 => exactly the header value (no jitter)
    expect(computeRetryDelay(0, '2', () => 0)).toBe(2_000);
    // rand 1 => header + full jitter spread (capped * JITTER_RATIO)
    expect(computeRetryDelay(0, '2', () => 1)).toBe(3_000);
    // header above ceiling is capped to RETRY_AFTER_CEILING_MS (10s)
    expect(computeRetryDelay(0, '30', () => 0)).toBe(RETRY.RETRY_AFTER_CEILING_MS);
    expect(computeRetryDelay(0, '30', () => 1)).toBe(
      RETRY.RETRY_AFTER_CEILING_MS + RETRY.RETRY_AFTER_CEILING_MS * RETRY.JITTER_RATIO
    );
    // any rand in [0,1] stays within [header, header + jitter]
    const delay = computeRetryDelay(2, '5', () => 0.42);
    expect(delay).toBeGreaterThanOrEqual(5_000);
    expect(delay).toBeLessThanOrEqual(5_000 + 5_000 * RETRY.JITTER_RATIO);
  });

  it('grows exponentially with full jitter when no header is present', () => {
    // rand=1 => full backoff value; rand=0 => zero (full jitter lower bound)
    expect(computeRetryDelay(0, undefined, () => 1)).toBe(1_000);
    expect(computeRetryDelay(1, undefined, () => 1)).toBe(2_000);
    expect(computeRetryDelay(2, undefined, () => 1)).toBe(4_000);
    // capped at MAX_BACKOFF_MS
    expect(computeRetryDelay(3, undefined, () => 1)).toBe(RETRY.MAX_BACKOFF_MS);
    expect(computeRetryDelay(4, undefined, () => 1)).toBe(RETRY.MAX_BACKOFF_MS);
    expect(computeRetryDelay(1, undefined, () => 0)).toBe(0);
  });

  it('falls back to exponential backoff for non-numeric or negative Retry-After', () => {
    expect(computeRetryDelay(1, 'abc', () => 1)).toBe(2_000);
    expect(computeRetryDelay(1, '-5', () => 1)).toBe(2_000);
    expect(computeRetryDelay(1, '', () => 1)).toBe(2_000);
    expect(computeRetryDelay(1, null, () => 1)).toBe(2_000);
  });
});

describe('shouldRetry', () => {
  it('retries only GET requests with a 429 response', () => {
    expect(shouldRetry({ method: 'get' }, { status: 429 })).toBe(true);
    expect(shouldRetry({ method: 'post' }, { status: 429 })).toBe(false);
    expect(shouldRetry({ method: 'put' }, { status: 429 })).toBe(false);
    expect(shouldRetry({ method: 'delete' }, { status: 429 })).toBe(false);
    expect(shouldRetry({ method: 'get' }, { status: 500 })).toBe(false);
    expect(shouldRetry({ method: 'get' }, { status: 200 })).toBe(false);
    expect(shouldRetry({ method: 'POST' }, { status: 429 })).toBe(false);
  });
});

describe('createRateLimitInterceptor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLanguage('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recovers 429 -> 429 -> 200 in exactly 3 attempts (2 retries)', async () => {
    const { client, requests } = createScriptedClient([
      { status: 429 },
      { status: 429 },
      { status: 200 },
    ]);
    createRateLimitInterceptor(client);

    const promise = client.get('/tasks/user');
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.data.ok).toBe(true);
    expect(requests).toHaveLength(3);
  });

  it('honors Retry-After by sleeping at least the header value before retrying', async () => {
    const { client, requests } = createScriptedClient([
      { status: 429, headers: { 'retry-after': '2' } },
      { status: 200 },
    ]);
    const delays = [];
    createRateLimitInterceptor(client, {
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    await client.get('/tasks/user');

    expect(requests).toHaveLength(2);
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThanOrEqual(2_000);
    expect(delays[0]).toBeLessThanOrEqual(3_000);
  });

  it('gives up after 4 attempts with a bilingual rate-limit error', async () => {
    const { client, requests } = createScriptedClient([
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 },
    ]);
    createRateLimitInterceptor(client);

    // Attach the rejection handler BEFORE advancing timers so the
    // final rejection is never reported as unhandled.
    const promise = client.get('/tasks/user');
    const rejected = expect(promise).rejects.toThrow(/rate limit/i);
    await vi.runAllTimersAsync();
    await rejected;

    expect(requests).toHaveLength(4);
  });

  it('fails a POST 429 with exactly 1 attempt and never retries', async () => {
    const { client, requests } = createScriptedClient([
      { status: 429 },
      { status: 200 },
    ]);
    createRateLimitInterceptor(client);

    const promise = client.post('/tasks/user', { text: 'x' });
    const rejected = expect(promise).rejects.toThrow(/not retried/i);
    await vi.runAllTimersAsync();
    await rejected;

    expect(requests).toHaveLength(1);
  });

  it('does not retry PUT or DELETE on 429', async () => {
    const putClient = createScriptedClient([{ status: 429 }, { status: 200 }]);
    createRateLimitInterceptor(putClient.client);
    const putPromise = putClient.client.put('/tasks/abc', { text: 'x' });
    const putRejected = expect(putPromise).rejects.toThrow(/rate limit/i);
    await vi.runAllTimersAsync();
    await putRejected;
    expect(putClient.requests).toHaveLength(1);

    const deleteClient = createScriptedClient([{ status: 429 }, { status: 200 }]);
    createRateLimitInterceptor(deleteClient.client);
    const deletePromise = deleteClient.client.delete('/tasks/abc');
    const deleteRejected = expect(deletePromise).rejects.toThrow(/rate limit/i);
    await vi.runAllTimersAsync();
    await deleteRejected;
    expect(deleteClient.requests).toHaveLength(1);
  });

  it('passes 500 errors through without retry', async () => {
    const { client, requests } = createScriptedClient([{ status: 500 }]);
    createRateLimitInterceptor(client);

    const promise = client.get('/tasks/user');
    const rejected = expect(promise).rejects.toThrow(/status code 500/);
    await vi.runAllTimersAsync();
    await rejected;

    expect(requests).toHaveLength(1);
  });

  it('passes 2xx responses through unchanged', async () => {
    const { client, requests } = createScriptedClient([{ status: 200 }]);
    createRateLimitInterceptor(client);

    const response = await client.get('/tasks/user');

    expect(response.data.ok).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('produces Chinese rate-limit errors under zh-CN locale', async () => {
    setLanguage('zh-CN');
    const { client } = createScriptedClient([{ status: 429 }]);
    createRateLimitInterceptor(client);

    const promise = client.post('/tasks/user', { text: 'x' });
    const rejected = expect(promise).rejects.toThrow(/速率限制/);
    await vi.runAllTimersAsync();
    await rejected;
  });
});