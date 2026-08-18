/* Dashboard API. Same-origin only: the browser sends a HttpOnly session cookie
   plus an X-Tells-Admin header, which together make a cross-site form post
   useless to an attacker. */
import { HttpError, cookieHeader, readJsonBody, sendJson } from '../util/http.js';
import { hashIp, newSiteKey } from '../util/crypto.js';
import { normalizeOrigin } from '../util/validation.js';
import {
    checkAdminPassword, createAdminSession, destroyAdminSession, readAdminSession, setAdminPassword,
} from '../auth.js';
import { getSetting, logAudit, setSetting } from '../db.js';
import { rateLimit } from '../ratelimit.js';

export const SESSION_COOKIE = 'tells_admin';

function requireAdmin(ctx, req) {
    const token = ctx.cookies(req)[SESSION_COOKIE];
    const session = readAdminSession(ctx.db, token);
    if (!session) throw new HttpError(401, 'unauthorized', 'נדרשת התחברות');
    return session;
}

/* Any state change must carry the custom header, which a cross-site form or
   image request cannot set without passing a CORS preflight we never allow. */
function requireCsrfHeader(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    if (req.headers['x-tells-admin'] !== '1') {
        throw new HttpError(403, 'csrf', 'בקשה לא חוקית');
    }
}

const num = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

function siteRow(row) {
    let origins = [];
    try { origins = JSON.parse(row.origins); } catch { origins = []; }
    return {
        id: row.id,
        key: row.key,
        name: row.name,
        origins,
        moderation: row.moderation,
        allowAnonymous: !!row.allow_anonymous,
        commentsOn: !!row.comments_on,
        likesOn: !!row.likes_on,
        locale: row.locale,
        active: !!row.active,
        createdAt: row.created_at,
    };
}

function commentRow(row) {
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

/* ---- session ---- */

async function login(ctx, req, res, body) {
    const ip = ctx.ipOf(req);
    const limit = rateLimit(`login:${ip}`, ctx.config.rateLimits.login);
    if (!limit.allowed) {
        throw new HttpError(429, 'rate_limited', 'יותר מדי ניסיונות התחברות, נסו שוב מאוחר יותר', {
            retryAfter: limit.retryAfter,
        });
    }
    if (!checkAdminPassword(ctx.db, body.password)) {
        logAudit(ctx.db, 'admin.login_failed', 'session', null, { ipHash: hashIp(ip, ctx.ipSalt) });
        throw new HttpError(401, 'bad_credentials', 'סיסמה שגויה');
    }
    const session = createAdminSession(ctx.db, {
        ipHash: hashIp(ip, ctx.ipSalt),
        ttlHours: ctx.config.sessionTtlHours,
    });
    logAudit(ctx.db, 'admin.login', 'session', null, null);
    sendJson(res, 200, { ok: true, expiresAt: session.expiresAt }, {
        'set-cookie': cookieHeader(SESSION_COOKIE, session.token, {
            maxAge: session.maxAge,
            secure: ctx.config.secureCookies,
        }),
    });
}

function logout(ctx, req, res) {
    destroyAdminSession(ctx.db, ctx.cookies(req)[SESSION_COOKIE]);
    sendJson(res, 200, { ok: true }, {
        'set-cookie': cookieHeader(SESSION_COOKIE, '', { maxAge: 0, secure: ctx.config.secureCookies }),
    });
}

function session(ctx, req, res) {
    const token = ctx.cookies(req)[SESSION_COOKIE];
    const active = !!readAdminSession(ctx.db, token);
    sendJson(res, 200, { authenticated: active });
}

async function changePassword(ctx, req, res, body) {
    if (!checkAdminPassword(ctx.db, body.currentPassword)) {
        throw new HttpError(401, 'bad_credentials', 'הסיסמה הנוכחית שגויה');
    }
    const next = String(body.newPassword ?? '');
    if (next.length < 8) throw new HttpError(400, 'weak_password', 'הסיסמה חייבת להכיל לפחות 8 תווים');
    setAdminPassword(ctx.db, next);
    ctx.db.prepare('DELETE FROM admin_sessions').run();
    logAudit(ctx.db, 'admin.password_changed', 'session', null, null);
    sendJson(res, 200, { ok: true }, {
        'set-cookie': cookieHeader(SESSION_COOKIE, '', { maxAge: 0, secure: ctx.config.secureCookies }),
    });
}

/* ---- overview ---- */

function overview(ctx, res) {
    const db = ctx.db;
    const one = (sql, ...args) => db.prepare(sql).get(...args);

    const totals = {
        sites: one('SELECT COUNT(*) AS n FROM sites').n,
        comments: one('SELECT COUNT(*) AS n FROM comments').n,
        pending: one(`SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'`).n,
        approved: one(`SELECT COUNT(*) AS n FROM comments WHERE status = 'approved'`).n,
        rejected: one(`SELECT COUNT(*) AS n FROM comments WHERE status = 'rejected'`).n,
        likes: one('SELECT COUNT(*) AS n FROM likes').n,
        visitors: one('SELECT COUNT(*) AS n FROM visitors').n,
        emailVisitors: one(`SELECT COUNT(*) AS n FROM visitors WHERE kind = 'email'`).n,
        anonymousVisitors: one(`SELECT COUNT(*) AS n FROM visitors WHERE kind = 'anonymous'`).n,
    };

    const perSite = db.prepare(`
        SELECT s.id, s.key, s.name,
               (SELECT COUNT(*) FROM comments c WHERE c.site_id = s.id) AS comments,
               (SELECT COUNT(*) FROM comments c WHERE c.site_id = s.id AND c.status = 'pending') AS pending,
               (SELECT COUNT(*) FROM likes l WHERE l.site_id = s.id) AS likes,
               (SELECT COUNT(*) FROM visitors v WHERE v.site_id = s.id) AS visitors
        FROM sites s ORDER BY s.name`).all();

    const since = new Date(Date.now() - 13 * 86400_000).toISOString().slice(0, 10);
    const daily = db.prepare(`
        SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS comments
        FROM comments WHERE substr(created_at, 1, 10) >= ?
        GROUP BY day ORDER BY day`).all(since);
    const dailyLikes = db.prepare(`
        SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS likes
        FROM likes WHERE substr(created_at, 1, 10) >= ?
        GROUP BY day ORDER BY day`).all(since);

    const topPages = db.prepare(`
        SELECT s.name AS site_name, l.page_path, l.page_title, COUNT(*) AS likes
        FROM likes l JOIN sites s ON s.id = l.site_id
        GROUP BY l.site_id, l.page_path ORDER BY likes DESC LIMIT 10`).all();

    const latest = db.prepare(`
        SELECT c.*, s.name AS site_name, s.key AS site_key
        FROM comments c JOIN sites s ON s.id = c.site_id
        ORDER BY c.created_at DESC LIMIT 8`).all();

    sendJson(res, 200, {
        totals,
        perSite,
        daily,
        dailyLikes,
        topPages,
        latest: latest.map(commentRow),
    });
}

/* ---- sites ---- */

function listSites(ctx, res) {
    const rows = ctx.db.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
    sendJson(res, 200, { sites: rows.map(siteRow) });
}

function parseOrigins(input) {
    const raw = Array.isArray(input)
        ? input
        : String(input ?? '').split(/[\s,]+/);
    const origins = [];
    for (const entry of raw) {
        const normalized = normalizeOrigin(entry);
        if (normalized && !origins.includes(normalized)) origins.push(normalized);
    }
    return origins;
}

function createSite(ctx, res, body) {
    const name = String(body.name ?? '').trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'name_required', 'צריך לתת שם לאתר');
    const origins = parseOrigins(body.origins);
    const key = newSiteKey();
    const info = ctx.db.prepare(`INSERT INTO sites
            (key, name, origins, moderation, allow_anonymous, comments_on, likes_on, locale, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
        .run(
            key, name, JSON.stringify(origins),
            body.moderation === 'post' ? 'post' : 'pre',
            body.allowAnonymous === false ? 0 : 1,
            body.commentsOn === false ? 0 : 1,
            body.likesOn === false ? 0 : 1,
            body.locale === 'en' ? 'en' : 'he',
            new Date().toISOString(),
        );
    const row = ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(info.lastInsertRowid);
    logAudit(ctx.db, 'site.create', 'site', row.id, { name, key });
    sendJson(res, 201, { site: siteRow(row) });
}

function updateSite(ctx, res, id, body) {
    const existing = ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'האתר לא נמצא');

    const next = {
        name: body.name !== undefined ? String(body.name).trim().slice(0, 120) || existing.name : existing.name,
        origins: body.origins !== undefined ? JSON.stringify(parseOrigins(body.origins)) : existing.origins,
        moderation: body.moderation !== undefined ? (body.moderation === 'post' ? 'post' : 'pre') : existing.moderation,
        allow_anonymous: body.allowAnonymous !== undefined ? (body.allowAnonymous ? 1 : 0) : existing.allow_anonymous,
        comments_on: body.commentsOn !== undefined ? (body.commentsOn ? 1 : 0) : existing.comments_on,
        likes_on: body.likesOn !== undefined ? (body.likesOn ? 1 : 0) : existing.likes_on,
        locale: body.locale !== undefined ? (body.locale === 'en' ? 'en' : 'he') : existing.locale,
        active: body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
    };
    ctx.db.prepare(`UPDATE sites SET name = ?, origins = ?, moderation = ?, allow_anonymous = ?,
                    comments_on = ?, likes_on = ?, locale = ?, active = ? WHERE id = ?`)
        .run(next.name, next.origins, next.moderation, next.allow_anonymous,
            next.comments_on, next.likes_on, next.locale, next.active, id);
    const row = ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    logAudit(ctx.db, 'site.update', 'site', id, { name: next.name });
    sendJson(res, 200, { site: siteRow(row) });
}

/* Rotating the key silences every widget still using the old one — the way to
   cut off a site whose snippet leaked. */
function rotateSiteKey(ctx, res, id) {
    const existing = ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'האתר לא נמצא');
    const key = newSiteKey();
    ctx.db.prepare('UPDATE sites SET key = ? WHERE id = ?').run(key, id);
    logAudit(ctx.db, 'site.rotate_key', 'site', id, null);
    sendJson(res, 200, { site: siteRow(ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(id)) });
}

function deleteSite(ctx, res, id) {
    const existing = ctx.db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'האתר לא נמצא');
    ctx.db.prepare('DELETE FROM sites WHERE id = ?').run(id);
    logAudit(ctx.db, 'site.delete', 'site', id, { name: existing.name });
    sendJson(res, 200, { ok: true });
}

/* ---- comments ---- */

function listComments(ctx, res, url) {
    const status = url.searchParams.get('status') || 'all';
    const siteId = num(url.searchParams.get('site'), 0);
    const search = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);
    const offset = Math.max(num(url.searchParams.get('offset'), 0), 0);
    const order = url.searchParams.get('order') === 'oldest' ? 'ASC' : 'DESC';

    const where = [];
    const args = [];
    if (['pending', 'approved', 'rejected'].includes(status)) { where.push('c.status = ?'); args.push(status); }
    if (siteId) { where.push('c.site_id = ?'); args.push(siteId); }
    if (search) {
        where.push('(c.body LIKE ? OR c.author_name LIKE ? OR c.author_email LIKE ? OR c.page_path LIKE ?)');
        const like = `%${search}%`;
        args.push(like, like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = ctx.db.prepare(`
        SELECT c.*, s.name AS site_name, s.key AS site_key
        FROM comments c JOIN sites s ON s.id = c.site_id
        ${clause} ORDER BY c.created_at ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    const { n } = ctx.db.prepare(`SELECT COUNT(*) AS n FROM comments c ${clause}`).get(...args);

    const counts = ctx.db.prepare(`
        SELECT status, COUNT(*) AS n FROM comments GROUP BY status`).all()
        .reduce((acc, row) => ({ ...acc, [row.status]: row.n }), { pending: 0, approved: 0, rejected: 0 });

    sendJson(res, 200, { comments: rows.map(commentRow), total: n, limit, offset, counts });
}

function setCommentStatus(ctx, res, id, status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
        throw new HttpError(400, 'bad_status', 'סטטוס לא מוכר');
    }
    const existing = ctx.db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'התגובה לא נמצאה');
    ctx.db.prepare('UPDATE comments SET status = ?, moderated_at = ? WHERE id = ?')
        .run(status, new Date().toISOString(), id);
    logAudit(ctx.db, `comment.${status}`, 'comment', id, null);
    const row = ctx.db.prepare(`
        SELECT c.*, s.name AS site_name, s.key AS site_key
        FROM comments c JOIN sites s ON s.id = c.site_id WHERE c.id = ?`).get(id);
    sendJson(res, 200, { comment: commentRow(row) });
}

function deleteComment(ctx, res, id) {
    const existing = ctx.db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'התגובה לא נמצאה');
    ctx.db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    logAudit(ctx.db, 'comment.delete', 'comment', id, {
        site_id: existing.site_id, author: existing.author_name, body: existing.body.slice(0, 200),
    });
    sendJson(res, 200, { ok: true });
}

function bulkComments(ctx, res, body) {
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => num(id, 0)).filter(Boolean) : [];
    if (!ids.length) throw new HttpError(400, 'no_ids', 'לא נבחרו תגובות');
    if (ids.length > 500) throw new HttpError(400, 'too_many', 'יותר מדי תגובות בפעולה אחת');
    const action = body.action;
    const placeholders = ids.map(() => '?').join(',');

    if (action === 'delete') {
        ctx.db.prepare(`DELETE FROM comments WHERE id IN (${placeholders})`).run(...ids);
    } else if (['approve', 'reject', 'pending'].includes(action)) {
        const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
        ctx.db.prepare(`UPDATE comments SET status = ?, moderated_at = ? WHERE id IN (${placeholders})`)
            .run(status, new Date().toISOString(), ...ids);
    } else {
        throw new HttpError(400, 'bad_action', 'פעולה לא מוכרת');
    }
    logAudit(ctx.db, `comment.bulk_${action}`, 'comment', null, { count: ids.length });
    sendJson(res, 200, { ok: true, affected: ids.length });
}

/* ---- visitors, likes, settings, audit ---- */

function listVisitors(ctx, res, url) {
    const siteId = num(url.searchParams.get('site'), 0);
    const search = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);
    const where = [];
    const args = [];
    if (siteId) { where.push('v.site_id = ?'); args.push(siteId); }
    if (search) {
        where.push('(v.email LIKE ? OR v.name LIKE ?)');
        args.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = ctx.db.prepare(`
        SELECT v.*, s.name AS site_name,
               (SELECT COUNT(*) FROM comments c WHERE c.visitor_id = v.id) AS comments,
               (SELECT COUNT(*) FROM likes l WHERE l.visitor_id = v.id) AS likes
        FROM visitors v JOIN sites s ON s.id = v.site_id
        ${clause} ORDER BY v.last_seen_at DESC LIMIT ?`).all(...args, limit);

    sendJson(res, 200, {
        visitors: rows.map((row) => ({
            id: row.id,
            siteId: row.site_id,
            siteName: row.site_name,
            kind: row.kind,
            email: row.email,
            name: row.name,
            blocked: !!row.blocked,
            comments: row.comments,
            likes: row.likes,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
        })),
    });
}

/* Blocking a visitor stops new comments and likes, and hides what they already
   wrote by pushing it back into the pending queue. */
function setVisitorBlocked(ctx, res, id, blocked) {
    const existing = ctx.db.prepare('SELECT * FROM visitors WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'not_found', 'המבקר לא נמצא');
    ctx.db.prepare('UPDATE visitors SET blocked = ? WHERE id = ?').run(blocked ? 1 : 0, id);
    if (blocked) {
        ctx.db.prepare(`UPDATE comments SET status = 'pending', moderated_at = ?
                        WHERE visitor_id = ? AND status = 'approved'`)
            .run(new Date().toISOString(), id);
    }
    logAudit(ctx.db, blocked ? 'visitor.block' : 'visitor.unblock', 'visitor', id, null);
    sendJson(res, 200, { ok: true });
}

function listLikes(ctx, res, url) {
    const siteId = num(url.searchParams.get('site'), 0);
    const args = [];
    let clause = '';
    if (siteId) { clause = 'WHERE l.site_id = ?'; args.push(siteId); }
    const rows = ctx.db.prepare(`
        SELECT s.name AS site_name, s.key AS site_key, l.site_id, l.page_path,
               MAX(l.page_title) AS page_title, MAX(l.page_url) AS page_url,
               COUNT(*) AS likes, MAX(l.created_at) AS last_at
        FROM likes l JOIN sites s ON s.id = l.site_id
        ${clause}
        GROUP BY l.site_id, l.page_path ORDER BY likes DESC LIMIT 200`).all(...args);
    sendJson(res, 200, { pages: rows });
}

function readSettings(ctx, res) {
    let blocklist = [];
    try { blocklist = JSON.parse(getSetting(ctx.db, 'blocklist') || '[]'); } catch { blocklist = []; }
    sendJson(res, 200, {
        blocklist,
        emailDnsCheck: ctx.config.emailDnsCheck,
        blockDisposableEmail: ctx.config.blockDisposableEmail,
        maxCommentLength: ctx.config.maxCommentLength,
    });
}

function writeSettings(ctx, res, body) {
    if (body.blocklist !== undefined) {
        const list = Array.isArray(body.blocklist)
            ? body.blocklist
            : String(body.blocklist).split(/[\n,]+/);
        const cleaned = list.map((word) => String(word).trim()).filter(Boolean).slice(0, 500);
        setSetting(ctx.db, 'blocklist', JSON.stringify(cleaned));
        logAudit(ctx.db, 'settings.blocklist', 'settings', null, { count: cleaned.length });
    }
    readSettings(ctx, res);
}

function listAudit(ctx, res, url) {
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);
    const rows = ctx.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
    sendJson(res, 200, { entries: rows });
}

function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function exportComments(ctx, res, url) {
    const siteId = num(url.searchParams.get('site'), 0);
    const args = [];
    let clause = '';
    if (siteId) { clause = 'WHERE c.site_id = ?'; args.push(siteId); }
    const rows = ctx.db.prepare(`
        SELECT c.*, s.name AS site_name FROM comments c JOIN sites s ON s.id = c.site_id
        ${clause} ORDER BY c.created_at DESC`).all(...args);

    const header = ['id', 'site', 'page', 'author', 'email', 'anonymous', 'status', 'score', 'created_at', 'body'];
    const lines = [header.join(',')];
    for (const row of rows) {
        lines.push([
            row.id, row.site_name, row.page_path, row.author_name, row.author_email ?? '',
            row.is_anonymous ? 'yes' : 'no', row.status, row.spam_score, row.created_at, row.body,
        ].map(csvCell).join(','));
    }
    /* The BOM keeps Hebrew readable when the file is opened in Excel. */
    const csv = `﻿${lines.join('\n')}`;
    res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="comments.csv"',
        'content-length': Buffer.byteLength(csv),
    });
    res.end(csv);
}

export async function handleAdminRoute(ctx, req, res, url) {
    const { pathname } = url;
    if (!pathname.startsWith('/admin/api/')) return false;
    const route = pathname.slice('/admin/api'.length);
    const method = req.method;

    requireCsrfHeader(req);
    const body = method === 'GET' || method === 'DELETE'
        ? {}
        : await readJsonBody(req, ctx.config.bodyLimitBytes);

    /* Open endpoints: everything else needs a live session. */
    if (route === '/login' && method === 'POST') { await login(ctx, req, res, body); return true; }
    if (route === '/session' && method === 'GET') { session(ctx, req, res); return true; }
    if (route === '/logout' && method === 'POST') { logout(ctx, req, res); return true; }

    requireAdmin(ctx, req);

    if (route === '/password' && method === 'POST') { await changePassword(ctx, req, res, body); return true; }
    if (route === '/overview' && method === 'GET') { overview(ctx, res); return true; }

    if (route === '/sites' && method === 'GET') { listSites(ctx, res); return true; }
    if (route === '/sites' && method === 'POST') { createSite(ctx, res, body); return true; }

    let match = route.match(/^\/sites\/(\d+)$/);
    if (match && method === 'PATCH') { updateSite(ctx, res, Number(match[1]), body); return true; }
    if (match && method === 'DELETE') { deleteSite(ctx, res, Number(match[1])); return true; }

    match = route.match(/^\/sites\/(\d+)\/rotate-key$/);
    if (match && method === 'POST') { rotateSiteKey(ctx, res, Number(match[1])); return true; }

    if (route === '/comments' && method === 'GET') { listComments(ctx, res, url); return true; }
    if (route === '/comments/bulk' && method === 'POST') { bulkComments(ctx, res, body); return true; }
    if (route === '/comments/export' && method === 'GET') { exportComments(ctx, res, url); return true; }

    match = route.match(/^\/comments\/(\d+)\/status$/);
    if (match && method === 'POST') { setCommentStatus(ctx, res, Number(match[1]), body.status); return true; }

    match = route.match(/^\/comments\/(\d+)$/);
    if (match && method === 'DELETE') { deleteComment(ctx, res, Number(match[1])); return true; }

    if (route === '/visitors' && method === 'GET') { listVisitors(ctx, res, url); return true; }
    match = route.match(/^\/visitors\/(\d+)\/block$/);
    if (match && method === 'POST') { setVisitorBlocked(ctx, res, Number(match[1]), body.blocked !== false); return true; }

    if (route === '/likes' && method === 'GET') { listLikes(ctx, res, url); return true; }
    if (route === '/settings' && method === 'GET') { readSettings(ctx, res); return true; }
    if (route === '/settings' && method === 'PATCH') { writeSettings(ctx, res, body); return true; }
    if (route === '/audit' && method === 'GET') { listAudit(ctx, res, url); return true; }

    return false;
}
