/* Runtime configuration. Everything is settable through the environment so the
   same build runs locally, on a VPS or inside a container without edits. */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '..');

/* .env is optional: the loader exists since Node 20.12 but throws when the
   file is missing, which is the normal case in production. */
const envFile = path.join(rootDir, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(envFile); } catch { /* malformed file: env wins */ }
}

const bool = (value, fallback) => {
    if (value === undefined || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const int = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

export const config = {
    port: int(process.env.PORT, 4000),
    host: process.env.HOST || '0.0.0.0',
    dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'engage.db'),
    publicDir: path.join(rootDir, 'public'),

    /* Set ADMIN_PASSWORD to pin the dashboard password. Without it the server
       generates one on first boot and prints it once. */
    adminPassword: process.env.ADMIN_PASSWORD || '',
    sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 12),
    secureCookies: bool(process.env.SECURE_COOKIES, false),

    /* A "valid email" is checked for syntax, then for a domain that actually
       accepts mail (MX/A lookup). Turn the DNS half off on isolated networks. */
    emailDnsCheck: bool(process.env.EMAIL_DNS_CHECK, true),
    emailDnsTimeoutMs: int(process.env.EMAIL_DNS_TIMEOUT_MS, 3000),
    blockDisposableEmail: bool(process.env.BLOCK_DISPOSABLE_EMAIL, true),

    /* X-Forwarded-For is only believed behind a proxy you control. */
    trustProxy: bool(process.env.TRUST_PROXY, false),

    maxCommentLength: int(process.env.MAX_COMMENT_LENGTH, 2000),
    maxNameLength: 60,
    bodyLimitBytes: int(process.env.BODY_LIMIT_BYTES, 32 * 1024),

    rateLimits: {
        /* requests per window, per IP */
        read: { limit: int(process.env.RATE_READ, 240), windowMs: 60_000 },
        write: { limit: int(process.env.RATE_WRITE, 20), windowMs: 60_000 },
        register: { limit: int(process.env.RATE_REGISTER, 10), windowMs: 10 * 60_000 },
        login: { limit: int(process.env.RATE_LOGIN, 10), windowMs: 10 * 60_000 },
    },
    /* Per visitor, on top of the per-IP limits above. */
    commentCooldownMs: int(process.env.COMMENT_COOLDOWN_MS, 20_000),
    commentsPerHour: int(process.env.COMMENTS_PER_HOUR, 12),
};

export default config;
