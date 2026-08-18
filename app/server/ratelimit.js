/* In-memory fixed-window rate limiting. One process, one map: enough for the
   single-instance deployments this server targets, and it costs nothing. */
const buckets = new Map(); // key -> { count, resetAt }

export function rateLimit(key, { limit, windowMs }) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > limit) {
        return { allowed: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

export function resetRateLimits() {
    buckets.clear();
}

/* Windows are short, so a sweep every few minutes keeps the map bounded even
   under a crawl that touches thousands of distinct addresses. */
const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
    }
}, 5 * 60_000);
sweeper.unref?.();
