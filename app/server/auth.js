/* Two independent identities live here:
   - the site owner, who logs into the dashboard with a password and gets a
     HttpOnly session cookie;
   - the visitor, who registers in one step (email or anonymous) and gets an
     opaque bearer token their browser keeps in localStorage.
   Neither token is ever stored in the clear. */
import { getSetting, setSetting } from './db.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './util/crypto.js';

const ADMIN_HASH_KEY = 'admin_password_hash';

/* First boot: honour ADMIN_PASSWORD when set, otherwise mint one and hand it
   back so the caller can print it exactly once. */
export function ensureAdminPassword(db, configuredPassword) {
    if (configuredPassword) {
        const stored = getSetting(db, ADMIN_HASH_KEY);
        if (!stored || !verifyPassword(configuredPassword, stored)) {
            setSetting(db, ADMIN_HASH_KEY, hashPassword(configuredPassword));
        }
        return { generated: false, password: null };
    }
    if (getSetting(db, ADMIN_HASH_KEY)) return { generated: false, password: null };

    const password = randomToken(12);
    setSetting(db, ADMIN_HASH_KEY, hashPassword(password));
    return { generated: true, password };
}

export function setAdminPassword(db, password) {
    setSetting(db, ADMIN_HASH_KEY, hashPassword(password));
}

export function checkAdminPassword(db, password) {
    const stored = getSetting(db, ADMIN_HASH_KEY);
    if (!stored) return false;
    return verifyPassword(String(password ?? ''), stored);
}

export function createAdminSession(db, { ipHash, ttlHours }) {
    const token = randomToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 3600_000);
    db.prepare(`INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip_hash)
                VALUES (?, ?, ?, ?)`)
        .run(sha256(token), now.toISOString(), expires.toISOString(), ipHash ?? null);
    return { token, expiresAt: expires.toISOString(), maxAge: ttlHours * 3600 };
}

export function readAdminSession(db, token) {
    if (!token) return null;
    const row = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(sha256(token));
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(row.token_hash);
        return null;
    }
    return row;
}

export function destroyAdminSession(db, token) {
    if (!token) return;
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
}

export function purgeExpiredSessions(db) {
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

/* ---- visitors ---- */

export function createVisitor(db, { siteId, kind, email, emailDomain, name, ipHash }) {
    const token = randomToken(32);
    const now = new Date().toISOString();
    const info = db.prepare(`INSERT INTO visitors
            (site_id, kind, email, email_domain, name, token_hash, ip_hash, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(siteId, kind, email ?? null, emailDomain ?? null, name, sha256(token), ipHash ?? null, now, now);
    const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(info.lastInsertRowid);
    return { token, visitor };
}

/* A returning visitor who types the same address gets the same identity back —
   their old comments stay attached to them — but always a fresh token. */
export function refreshVisitorToken(db, visitorId, { name, ipHash } = {}) {
    const token = randomToken(32);
    const now = new Date().toISOString();
    db.prepare(`UPDATE visitors SET token_hash = ?, last_seen_at = ?,
                name = COALESCE(?, name), ip_hash = COALESCE(?, ip_hash) WHERE id = ?`)
        .run(sha256(token), now, name ?? null, ipHash ?? null, visitorId);
    const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(visitorId);
    return { token, visitor };
}

export function findVisitorByEmail(db, siteId, email) {
    return db.prepare('SELECT * FROM visitors WHERE site_id = ? AND email = ?').get(siteId, email) || null;
}

export function findVisitorByToken(db, token) {
    if (!token) return null;
    return db.prepare('SELECT * FROM visitors WHERE token_hash = ?').get(sha256(token)) || null;
}

export function touchVisitor(db, visitorId) {
    db.prepare('UPDATE visitors SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), visitorId);
}

/* The widget sends its token as a bearer header; the body fallback keeps
   sendBeacon-style calls working. */
export function tokenFromRequest(req, body = {}) {
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return typeof body.token === 'string' ? body.token.trim() : '';
}
