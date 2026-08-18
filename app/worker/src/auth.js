/* Admin sessions and visitor identities, on D1. Mirrors the Node server's
   auth.js: nothing is stored in the clear — only SHA-256 of each token. */
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';
import { getSetting, one, run, setSetting } from './store.js';

const ADMIN_HASH_KEY = 'admin_password_hash';

/* The dashboard password arrives as a Worker secret. The hash is stored on
   first use so the secret can later be rotated or removed without locking the
   owner out mid-session. */
export async function checkAdminPassword(db, env, password) {
    const candidate = String(password ?? '');
    if (!candidate) return false;

    const stored = await getSetting(db, ADMIN_HASH_KEY);
    if (stored) return verifyPassword(candidate, stored);

    if (!env.ADMIN_PASSWORD) return false;
    if (candidate !== env.ADMIN_PASSWORD) return false;
    await setSetting(db, ADMIN_HASH_KEY, await hashPassword(candidate));
    return true;
}

export async function adminPasswordConfigured(db, env) {
    return !!env.ADMIN_PASSWORD || !!(await getSetting(db, ADMIN_HASH_KEY));
}

export async function setAdminPassword(db, password) {
    await setSetting(db, ADMIN_HASH_KEY, await hashPassword(password));
}

export async function createAdminSession(db, { ipHash, ttlHours }) {
    const token = randomToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 3600_000);
    await run(db, `INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip_hash) VALUES (?, ?, ?, ?)`,
        await sha256(token), now.toISOString(), expires.toISOString(), ipHash ?? null);
    return { token, expiresAt: expires.toISOString(), maxAge: ttlHours * 3600 };
}

export async function readAdminSession(db, token) {
    if (!token) return null;
    const hash = await sha256(token);
    const row = await one(db, 'SELECT * FROM admin_sessions WHERE token_hash = ?', hash);
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        await run(db, 'DELETE FROM admin_sessions WHERE token_hash = ?', hash);
        return null;
    }
    return row;
}

export async function destroyAdminSession(db, token) {
    if (!token) return;
    await run(db, 'DELETE FROM admin_sessions WHERE token_hash = ?', await sha256(token));
}

export function purgeExpiredSessions(db) {
    return run(db, 'DELETE FROM admin_sessions WHERE expires_at <= ?', new Date().toISOString());
}

/* ---- visitors ---- */

export async function createVisitor(db, { siteId, kind, email, emailDomain, name, ipHash }) {
    const token = randomToken(32);
    const now = new Date().toISOString();
    const result = await run(db, `INSERT INTO visitors
            (site_id, kind, email, email_domain, name, token_hash, ip_hash, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        siteId, kind, email ?? null, emailDomain ?? null, name, await sha256(token), ipHash ?? null, now, now);
    const visitor = await one(db, 'SELECT * FROM visitors WHERE id = ?', result.meta.last_row_id);
    return { token, visitor };
}

/* A returning visitor who types the same address gets the same identity back —
   their old comments stay attached to them — but always a fresh token. */
export async function refreshVisitorToken(db, visitorId, { name, ipHash } = {}) {
    const token = randomToken(32);
    await run(db, `UPDATE visitors SET token_hash = ?, last_seen_at = ?,
                   name = COALESCE(?, name), ip_hash = COALESCE(?, ip_hash) WHERE id = ?`,
        await sha256(token), new Date().toISOString(), name ?? null, ipHash ?? null, visitorId);
    const visitor = await one(db, 'SELECT * FROM visitors WHERE id = ?', visitorId);
    return { token, visitor };
}

export function findVisitorByEmail(db, siteId, email) {
    return one(db, 'SELECT * FROM visitors WHERE site_id = ? AND email = ?', siteId, email);
}

export async function findVisitorByToken(db, token) {
    if (!token) return null;
    return one(db, 'SELECT * FROM visitors WHERE token_hash = ?', await sha256(token));
}

export function touchVisitor(db, visitorId) {
    return run(db, 'UPDATE visitors SET last_seen_at = ? WHERE id = ?', new Date().toISOString(), visitorId);
}

export function tokenFromRequest(request, body = {}) {
    const header = request.headers.get('authorization');
    if (header && header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
    return typeof body.token === 'string' ? body.token.trim() : '';
}
