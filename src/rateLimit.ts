/**
 * Token-bucket rate limiter for API endpoints.
 * Enforces 100 requests per minute per IP.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const RATE_LIMIT_CONFIG = {
  tokensPerMinute: 100,
  refillInterval: 60000, // 1 minute in ms
};

/**
 * In-memory store of token buckets per IP address.
 * In production, this should use Redis or another distributed cache.
 */
const buckets = new Map<string, Bucket>();

/**
 * Get the client IP from a request.
 * Respects X-Forwarded-For header for proxied requests.
 */
export function getClientIP(req: { headers?: Record<string, any>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? '0.0.0.0';
}

/**
 * Refill the bucket for an IP based on elapsed time.
 * Calculates tokens to add based on minutes passed since last refill.
 */
function refillBucket(bucket: Bucket): void {
  const now = Date.now();
  const elapsedMs = now - bucket.lastRefill;
  const elapsedMinutes = elapsedMs / RATE_LIMIT_CONFIG.refillInterval;
  const tokensToAdd = elapsedMinutes * RATE_LIMIT_CONFIG.tokensPerMinute;

  bucket.tokens = Math.min(
    RATE_LIMIT_CONFIG.tokensPerMinute,
    bucket.tokens + tokensToAdd
  );
  bucket.lastRefill = now;
}

/**
 * Check if a request from an IP is allowed and consume a token if so.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(clientIP: string): boolean {
  let bucket = buckets.get(clientIP);

  if (!bucket) {
    bucket = {
      tokens: RATE_LIMIT_CONFIG.tokensPerMinute,
      lastRefill: Date.now(),
    };
    buckets.set(clientIP, bucket);
  }

  refillBucket(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
}

/**
 * Get the time until the next token is available for an IP (in seconds).
 * Used for the Retry-After header.
 */
export function getRetryAfter(clientIP: string): number {
  let bucket = buckets.get(clientIP);

  if (!bucket) {
    return 0;
  }

  refillBucket(bucket);

  if (bucket.tokens >= 1) {
    return 0;
  }

  // Calculate how long until we have 1 token
  const tokensNeeded = 1 - bucket.tokens;
  const secondsNeeded = (tokensNeeded / RATE_LIMIT_CONFIG.tokensPerMinute) * 60;

  return Math.ceil(secondsNeeded);
}

/**
 * Express/Connect middleware for rate limiting.
 * Returns 429 (Too Many Requests) with Retry-After header on breach.
 */
export function rateLimitMiddleware(
  req: {
    headers?: Record<string, any>;
    socket?: { remoteAddress?: string };
  },
  res: {
    statusCode?: number;
    setHeader?: (key: string, value: string | number) => void;
  },
  next?: () => void
): boolean {
  const clientIP = getClientIP(req);
  const allowed = checkRateLimit(clientIP);

  if (!allowed) {
    const retryAfter = getRetryAfter(clientIP);
    if (res.setHeader) {
      res.setHeader('Retry-After', retryAfter);
    }
    if (res.statusCode !== undefined) {
      res.statusCode = 429;
    }
    return false;
  }

  if (next) {
    next();
  }
  return true;
}

/**
 * Clear all buckets (useful for testing).
 */
export function clearBuckets(): void {
  buckets.clear();
}

/**
 * Get bucket stats for a specific IP (useful for testing).
 */
export function getBucketStats(clientIP: string): Bucket | undefined {
  return buckets.get(clientIP);
}
