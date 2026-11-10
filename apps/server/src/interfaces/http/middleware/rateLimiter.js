import { RateLimitError } from '../../../domain/errors.js';

class SlidingWindowLimiter {
  constructor(windowMs = 60000, maxRequests = 40) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.hits = new Map();
  }

  isLimited(key) {
    const now = Date.now();
    const timestamps = (this.hits.get(key) || []).filter(t => now - t < this.windowMs);
    if (timestamps.length >= this.maxRequests) {
      return true;
    }
    timestamps.push(now);
    this.hits.set(key, timestamps);
    return false;
  }
}

const chatLimiter = new SlidingWindowLimiter(60000, 30);

export function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const clientId = req.userId || 'anon';
  const key = `${ip}:${clientId}`;

  if (chatLimiter.isLimited(key)) {
    return next(new RateLimitError('Chat rate limit reached. Please wait a minute before sending more queries.'));
  }
  next();
}

