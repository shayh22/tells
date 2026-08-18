/* Rate limiting in D1. A Worker keeps nothing between requests and runs in many
   isolates at once, so the counter lives in the database — one row per bucket
   and caller, replaced when its window expires. Only writes are limited this
   way; reads are left to Cloudflare's own edge protections. */
import { HttpError } from './http.js';
import { one, run } from './store.js';

export async function rateLimit(db, key, { limit, windowMs }) {
    const now = Date.now();
    const row = await one(db, 'SELECT count, reset_at FROM rate_hits WHERE key = ?', key);

    if (!row || row.reset_at <= now) {
        await run(db, `INSERT INTO rate_hits (key, count, reset_at) VALUES (?, 1, ?)
                       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
            key, now + windowMs);
        return { allowed: true, retryAfter: 0 };
    }

    if (row.count >= limit) {
        return { allowed: false, retryAfter: Math.ceil((row.reset_at - now) / 1000) };
    }
    await run(db, 'UPDATE rate_hits SET count = count + 1 WHERE key = ?', key);
    return { allowed: true, retryAfter: 0 };
}

export async function limitOr429(db, bucket, key, limits) {
    const result = await rateLimit(db, `${bucket}:${key}`, limits);
    if (!result.allowed) {
        throw new HttpError(429, 'rate_limited', 'יותר מדי בקשות, נסו שוב בעוד רגע', { retryAfter: result.retryAfter });
    }
}

/* Expired rows are worthless; clearing them occasionally keeps the table small
   without a scheduled job. Runs after the response is sent. */
export function sweepRateHits(db) {
    return run(db, 'DELETE FROM rate_hits WHERE reset_at <= ?', Date.now());
}
