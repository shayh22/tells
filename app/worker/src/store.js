/* D1 access. Same tables and same column names as the Node server's SQLite
   file, so a database exported from one can be imported into the other. */
import { randomToken } from './crypto.js';

const bound = (db, sql, args) => (args.length ? db.prepare(sql).bind(...args) : db.prepare(sql));

export const one = (db, sql, ...args) => bound(db, sql, args).first();
export const run = (db, sql, ...args) => bound(db, sql, args).run();
export async function all(db, sql, ...args) {
    const result = await bound(db, sql, args).all();
    return result.results ?? [];
}

export async function getSetting(db, key) {
    const row = await one(db, 'SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : null;
}

export async function setSetting(db, key, value) {
    await run(db, `INSERT INTO settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, String(value));
}

/* A per-install salt keeps stored IP hashes from being reversible with a
   rainbow table. */
export async function ensureIpSalt(db) {
    const existing = await getSetting(db, 'ip_salt');
    if (existing) return existing;
    const salt = randomToken(16);
    await setSetting(db, 'ip_salt', salt);
    return salt;
}

export function logAudit(db, action, entity, entityId, details) {
    return run(db, `INSERT INTO audit_log (action, entity, entity_id, details, created_at)
                    VALUES (?, ?, ?, ?, ?)`,
        action, entity, entityId ?? null, details ? JSON.stringify(details) : null, new Date().toISOString());
}

export async function blocklist(db) {
    try {
        const parsed = JSON.parse((await getSetting(db, 'blocklist')) || '[]');
        return Array.isArray(parsed) ? parsed.slice(0, 500) : [];
    } catch {
        return [];
    }
}

/* ---- sites ---- */

export function siteByKey(db, key) {
    if (!key) return null;
    return one(db, 'SELECT * FROM sites WHERE key = ? AND active = 1', String(key));
}

export function siteById(db, id) {
    return one(db, 'SELECT * FROM sites WHERE id = ?', id);
}

export function siteOrigins(site) {
    if (!site) return [];
    try {
        const list = JSON.parse(site.origins);
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

/* A site with no registered origin is in "anywhere" mode, which is what a fresh
   install needs while the owner is still wiring the widget up. */
export function allowedOriginsFor(site) {
    const origins = siteOrigins(site);
    if (!origins.length || origins.includes('*')) return '*';
    return origins;
}

export function publicSite(site) {
    return {
        key: site.key,
        name: site.name,
        locale: site.locale,
        moderation: site.moderation,
        allowAnonymous: !!site.allow_anonymous,
        commentsEnabled: !!site.comments_on,
        likesEnabled: !!site.likes_on,
    };
}

export function adminSite(row) {
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        origins: siteOrigins(row),
        moderation: row.moderation,
        allowAnonymous: !!row.allow_anonymous,
        commentsOn: !!row.comments_on,
        likesOn: !!row.likes_on,
        locale: row.locale,
        active: !!row.active,
        createdAt: row.created_at,
    };
}

/* ---- comments ---- */

export function publicComment(row) {
    return {
        id: row.id,
        parentId: row.parent_id,
        author: row.author_name,
        isAnonymous: !!row.is_anonymous,
        body: row.body,
        createdAt: row.created_at,
        status: row.status,
    };
}

export function adminComment(row) {
    let reasons = [];
    try { reasons = JSON.parse(row.spam_reasons); } catch { reasons = []; }
    return {
        id: row.id,
        siteId: row.site_id,
        siteName: row.site_name,
        siteKey: row.site_key,
        parentId: row.parent_id,
        pagePath: row.page_path,
        pageUrl: row.page_url,
        pageTitle: row.page_title,
        author: row.author_name,
        email: row.author_email,
        isAnonymous: !!row.is_anonymous,
        body: row.body,
        status: row.status,
        spamScore: row.spam_score,
        spamReasons: reasons,
        createdAt: row.created_at,
        moderatedAt: row.moderated_at,
        visitorId: row.visitor_id,
    };
}

/* ---- visitors ---- */

export function shapeVisitor(visitor) {
    return { id: visitor.id, name: visitor.name, kind: visitor.kind, email: visitor.email };
}
