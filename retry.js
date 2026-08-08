// Rate-limit (HTTP 429) handling for the Habitica API axios client.
//
// GET requests are safe to replay: a 429 is retried up to MAX_RETRIES
// times (4 total attempts) with bounded, Retry-After-aware exponential
// backoff plus jitter. State-changing requests (POST/PUT/DELETE) are
// NEVER auto-retried: a 429 fails them immediately so agents never
// duplicate writes (double task creation, double purchase).
import { t } from './i18n.js';

export const RETRY = {
  // Retries past the first attempt; 3 retries => 4 total attempts.
  MAX_RETRIES: 3,
  // Cap on the honored Retry-After value.
  RETRY_AFTER_CEILING_MS: 10_000,
  // First backoff delay when no Retry-After header is present.
  BACKOFF_BASE_MS: 1_000,
  // Exponential growth factor per attempt.
  BACKOFF_MULTIPLIER: 2,
  // Cap = BASE * MULTIPLIER^MAX_RETRIES.
  MAX_BACKOFF_MS: 8_000,
  // Uniform jitter spread relative to the computed delay.
  JITTER_RATIO: 0.5,
};

const RATE_LIMIT_EXHAUSTED = [
  'Habitica API rate limit exceeded: still rate-limited after 4 attempts. Try again later.',
  '超出 Habitica API 速率限制：重试 4 次后仍被限流。请稍后再试。',
];

const RATE_LIMIT_WRITE = [
  'Habitica API rate limit reached. This request was NOT retried to avoid duplicate writes. Try again later.',
  '已达到 Habitica API 速率限制。为避免重复写入，此请求未被重试。请稍后再试。',
];

// Parses a Retry-After header value into milliseconds.
// Returns null for absent, non-numeric, or negative values so callers
// fall back to exponential backoff.
function parseRetryAfterMs(header) {
  if (header == null || header === '') return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds * 1000;
}

// Computes the delay before the given retry attempt.
// `attempt` is the zero-based retry index (0 = first retry after the
// initial request). `rand` is injectable for deterministic tests.
//
// With a valid Retry-After header: delay = capped(header) + uniform
// jitter in [0, capped * JITTER_RATIO] — always at least the header
// value. Without a header: exponential backoff with full jitter in
// [0, min(BASE * 2^attempt, MAX_BACKOFF)] to avoid retry storms.
export function computeRetryDelay(attempt, retryAfterHeader, rand = Math.random) {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null) {
    const capped = Math.min(retryAfterMs, RETRY.RETRY_AFTER_CEILING_MS);
    return capped + rand() * capped * RETRY.JITTER_RATIO;
  }
  const backoff = Math.min(
    RETRY.BACKOFF_BASE_MS * RETRY.BACKOFF_MULTIPLIER ** attempt,
    RETRY.MAX_BACKOFF_MS
  );
  return rand() * backoff;
}

// Only idempotent GET requests may be retried on 429.
export function shouldRetry(config, response) {
  const method = (config?.method || 'get').toLowerCase();
  return method === 'get' && response?.status === 429;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Attaches a 429 response interceptor to the axios instance.
// `sleep` is injectable for tests; the real default wraps setTimeout.
export function createRateLimitInterceptor(client, { sleep = defaultSleep } = {}) {
  client.interceptors.response.use(undefined, async (error) => {
    const response = error?.response;
    if (!response || response.status !== 429) {
      return Promise.reject(error);
    }

    const config = error.config;
    const method = (config?.method || 'get').toLowerCase();

    // State-changing requests: fail cleanly, never retried.
    if (method !== 'get') {
      return Promise.reject(new Error(t(RATE_LIMIT_WRITE[0], RATE_LIMIT_WRITE[1])));
    }

    const retriesDone = config?.__rateLimitRetries || 0;
    if (retriesDone >= RETRY.MAX_RETRIES) {
      return Promise.reject(new Error(t(RATE_LIMIT_EXHAUSTED[0], RATE_LIMIT_EXHAUSTED[1])));
    }

    const retryAfter = response.headers?.['retry-after'];
    const delay = computeRetryDelay(retriesDone, retryAfter);
    await sleep(delay);
    config.__rateLimitRetries = retriesDone + 1;
    return client.request(config);
  });
}