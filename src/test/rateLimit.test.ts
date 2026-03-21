import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getClientIP,
  checkRateLimit,
  getRetryAfter,
  rateLimitMiddleware,
  clearBuckets,
  getBucketStats,
} from '../rateLimit.js';

describe('rateLimit module', () => {
  beforeEach(() => {
    clearBuckets();
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  describe('getClientIP', () => {
    it('should extract IP from X-Forwarded-For header', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' } };
      expect(getClientIP(req)).toBe('192.168.1.1');
    });

    it('should handle single IP in X-Forwarded-For', () => {
      const req = { headers: { 'x-forwarded-for': '203.0.113.45' } };
      expect(getClientIP(req)).toBe('203.0.113.45');
    });

    it('should fall back to socket.remoteAddress', () => {
      const req = { socket: { remoteAddress: '127.0.0.1' } };
      expect(getClientIP(req)).toBe('127.0.0.1');
    });

    it('should return default IP if no headers or socket', () => {
      const req = {};
      expect(getClientIP(req)).toBe('0.0.0.0');
    });

    it('should trim whitespace from forwarded IP', () => {
      const req = { headers: { 'x-forwarded-for': '  192.168.1.1  , 10.0.0.1' } };
      expect(getClientIP(req)).toBe('192.168.1.1');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const ip = '192.168.1.1';
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(ip)).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', () => {
      const ip = '192.168.1.1';
      // Use all 100 tokens
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip);
      }
      // Next request should be blocked
      expect(checkRateLimit(ip)).toBe(false);
    });

    it('should isolate rate limits per IP', () => {
      expect(checkRateLimit('192.168.1.1')).toBe(true);
      expect(checkRateLimit('192.168.1.2')).toBe(true);

      // Exhaust limit for first IP
      for (let i = 1; i < 100; i++) {
        checkRateLimit('192.168.1.1');
      }

      // First IP should be blocked
      expect(checkRateLimit('192.168.1.1')).toBe(false);
      // Second IP should still work
      expect(checkRateLimit('192.168.1.2')).toBe(true);
    });

    it('should refill tokens over time', () => {
      const ip = '192.168.1.1';

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip);
      }
      expect(checkRateLimit(ip)).toBe(false);

      // Advance time by 30 seconds (half a minute)
      vi.advanceTimersByTime(30000);

      // Should have ~50 tokens available
      let allowedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (checkRateLimit(ip)) allowedCount++;
        else break;
      }
      expect(allowedCount).toBeGreaterThanOrEqual(45);
      expect(allowedCount).toBeLessThanOrEqual(55);
    });

    it('should refill to full capacity after one minute', () => {
      const ip = '192.168.1.1';

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip);
      }

      // Advance by 1 minute
      vi.advanceTimersByTime(60000);

      // Should have 100 tokens again
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(ip)).toBe(true);
      }
      expect(checkRateLimit(ip)).toBe(false);
    });
  });

  describe('getRetryAfter', () => {
    it('should return 0 for IPs with available tokens', () => {
      const ip = '192.168.1.1';
      expect(getRetryAfter(ip)).toBe(0);
    });

    it('should return non-zero for rate-limited IPs', () => {
      const ip = '192.168.1.1';

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip);
      }

      const retryAfter = getRetryAfter(ip);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('should return 0 for non-existent IPs', () => {
      expect(getRetryAfter('999.999.999.999')).toBe(0);
    });

    it('should decrease Retry-After over time', () => {
      const ip = '192.168.1.1';

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip);
      }

      const retryAfter1 = getRetryAfter(ip);

      // Advance 20 seconds
      vi.advanceTimersByTime(20000);

      const retryAfter2 = getRetryAfter(ip);

      expect(retryAfter2).toBeLessThan(retryAfter1);
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests within limit', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res: any = {};
      const next = vi.fn();

      const result = rateLimitMiddleware(req, res, next);

      expect(result).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should block requests exceeding limit and set status 429', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res: any = { statusCode: 200, setHeader: vi.fn() };
      const next = vi.fn();

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('192.168.1.1');
      }

      const result = rateLimitMiddleware(req, res, next);

      expect(result).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('should set Retry-After header on rate limit', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res: any = { statusCode: 200, setHeader: vi.fn() };

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('192.168.1.1');
      }

      rateLimitMiddleware(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should work without next callback', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res: any = {};

      const result = rateLimitMiddleware(req, res);

      expect(result).toBe(true);
    });

    it('should handle missing setHeader', () => {
      const req = { headers: { 'x-forwarded-for': '192.168.1.1' } };
      const res: any = { statusCode: 200 };

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('192.168.1.1');
      }

      const result = rateLimitMiddleware(req, res);

      expect(result).toBe(false);
    });
  });

  describe('getBucketStats', () => {
    it('should return bucket stats for tracked IPs', () => {
      const ip = '192.168.1.1';
      checkRateLimit(ip);

      const stats = getBucketStats(ip);
      expect(stats).toBeDefined();
      expect(stats?.tokens).toBe(99); // 100 - 1 consumed
      expect(stats?.lastRefill).toBeGreaterThan(0);
    });

    it('should return undefined for non-tracked IPs', () => {
      expect(getBucketStats('999.999.999.999')).toBeUndefined();
    });
  });

  describe('clearBuckets', () => {
    it('should clear all bucket state', () => {
      checkRateLimit('192.168.1.1');
      checkRateLimit('192.168.1.2');

      expect(getBucketStats('192.168.1.1')).toBeDefined();
      expect(getBucketStats('192.168.1.2')).toBeDefined();

      clearBuckets();

      expect(getBucketStats('192.168.1.1')).toBeUndefined();
      expect(getBucketStats('192.168.1.2')).toBeUndefined();
    });
  });
});
