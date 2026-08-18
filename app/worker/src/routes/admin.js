/* Dashboard API on Workers. Same contract as the Node server: a HttpOnly
   session cookie plus an X-Tells-Admin header, which together make a cross-site
   form post useless to an attacker. */
import { HttpError, cookieHeader, json, readJson } from '../http.js';
import { hashIp, newSiteKey } from '../crypto.js';
import { normalizeOrigin } from '../../../shared/validation.js';
import {
    adminPasswordConfigured, checkAdminPassword, createAdminSession, destroyAdminSession,
    readAdminSession, setAdminPassword,
} from '../auth.js';
import { adminComment, adminSite, all, getSetting, logAudit, one, run, setSetting, siteById } from '../store.js';
import { limitOr429 } from '../ratelimit.js';

export const SESSION_COOKIE = 'tells_admin';

async function requireAdmin(ctx, request) {
    const session = await readAdminSession(ctx.db, ctx.cookies(request)[SESSION_COOKIE]);
    if (!session) throw new HttpError(401, 'unauthorized', 'נדרשת התחברות');
    return session;
}

/* Any state change must carry the custom header, which a cross-site form or
   image request cannot set without a CORS preflight we never allow. */
function requireCsrfHeader(request) {
    if (request.method === 'GET' || request.method === 'HEAD') return;
    if (request.headers.get('x-tells-admin') !== '1') {
        throw new HttpError(403, 'csrf', 'בקשה לא חוקית');
    }
}

const num = (value, fallback) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
};

/* ---- session ---- */

async function login(ctx, request, body) {
    await limitOr429(ctx.db, 'login', ctx.ipKey, ctx.config.rateLimits.login);

    if (!(await adminPasswordConfigured(ctx.db, ctx.env))) {
        throw new HttpError(503, 'no_password_set',
            'עדיין לא נקבעה סיסמת ניהול. הריצו: npx wrangler secret put ADMIN_PASSWORD');
    }
    if (!(await checkAdminPassword(ctx.db, ctx.env, body.password))) {
        ctx.defer(logAudit(ctx.db, 'admin.login_failed', 'session', null, { ipHash: await hashIp(ctx.ip, ctx.ipSalt) }));
        throw new HttpError(401, 'bad_credentials', 'סיסמה שגויה');
    }

    const session = await createAdminSession(ctx.db, {
        ipHash: await hashIp(ctx.ip, ctx.ipSalt),
        ttlHours: ctx.config.sessionTtlHours,
    });
    ctx.defer(logAudit(ctx.db, 'admin.login', 'session', null, null));
    return json({ ok: true, expiresAt: session.expiresAt }, {
        headers: { 'set-cookie': cookieHeader(SESSION_COOKIE, session.token, { maxAge: session.maxAge }) },
    });
}

async function logout(ctx, request) {
    await destroyAdminSession(ctx.db, ctx.cookies(request)[SESSION_COOKIE]);
    return json({ ok: true }, { headers: { 'set-cookie': cookieHeader(SESSION_COOKIE, '', { maxAge: 0 }) } });
}

async function session(ctx, request) {
    const active = !!(await readAdminSession(ctx.db, ctx.cookies(request)[SESSION_COOKIE]));
    return json({ authenticated: active, passwordConfigured: await adminPasswordConfigured(ctx.db, ctx.env) });
}

async function changePassword(ctx, body) {
    if (!(await checkAdminPassword(ctx.db, ctx.env, body.currentPassword))) {
        throw new HttpError(401, 'bad_credentials', 'הסיסמה הנוכחית שגויה');
    }
    const next = String(body.newPassword ?? '');
    if (next.length < 8) throw new HttpError(400, 'weak_password', 'הסיסמה חייבת להכיל לפחות 8 תווים');
    await setAdminPassword(ctx.db, next);
    await run(ctx.db, 'DELETE FROM admin_sessions');
    ctx.defer(logAudit(ctx.db, 'admin.password_changed', 'session', null, null));
    return json({ ok: true }, { headers: { 'set-cookie': cookieHeader(SESSION_COOKIE, '', { maxAge: 0 }) } });
}

/* ---- overview ---- */

async function overview(ctx) {
    const db = ctx.db;
    const counts = await one(db, `
        SELECT
            (SELECT COUNT(*) FROM sites) AS sites,
            (SELECT COUNT(*) FROM comments) AS comments,
            (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS pending,
            (SELECT COUNT(*) FROM comments WHERE status = 'approved') AS approved,
            (SELECT COUNT(*) FROM comments WHERE status = 'rejected') AS rejected,
            (SELECT COUNT(*) FROM likes) AS likes,
            (SELECT COUNT(*) FROM visitors) AS visitors,
            (SELECT COUNT(*) FROM visitors WHERE kind = 'email') AS emailVisitors,
            (SELECT COUNT(*) FROM visitors WHERE kind = 'anonymous') AS anonymousVisitors`);

    const since = new Date(Date.now() - 13 * 86400_000).toISOString().slice(0, 10);
    const [perSite, daily, dailyLikes, topPages, latest] = await Promise.all([
        all(db, `SELECT s.id, s.key, s.name,
                        (SELECT COUNT(*) FROM comments c WHERE c.site_id = s.id) AS comments,
                        (SELECT COUNT(*) FROM comments c WHERE c.site_id = s.id AND c.status = 'pending') AS pending,
                        (SELECT COUNT(*) FROM likes l WHERE l.site_id = s.id) AS likes,
                        (SELECT COUNT(*) FROM visitors v WHERE v.site_id = s.id) AS visitors
                 FROM sites s ORDER BY s.name`),
        all(db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS comments FROM comments
                 WHERE substr(created_at, 1, 10) >= ? GROUP BY day ORDER BY day`, since),
        all(db, `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS likes FROM likes
                 WHERE substr(created_at, 1, 10) >= ? GROUP BY day ORDER BY day`, since),
        all(db, `SELECT s.name AS site_name, l.page_path, l.page_title, COUNT(*) AS likes
                 FROM likes l JOIN sites s ON s.id = l.site_id
                 GROUP BY l.site_id, l.page_path ORDER BY likes DESC LIMIT 10`),
        all(db, `SELECT c.*, s.name AS site_name, s.key AS site_key FROM comments c JOIN sites s ON s.id = c.site_id
                 ORDER BY c.created_at DESC LIMIT 8`),
    ]);

    return json({ totals: counts, perSite, daily, dailyLikes, topPages, latest: latest.map(adminComment) });
}

/* ---- sites ---- */

async function listSites(ctx) {
    const rows = await all(ctx.db, 'SELECT * FROM sites ORDER BY created_at DESC');
    return json({ sites: rows.map(adminSite) });
}

function parseOrigins(input) {
    const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/);
    const origins = [];
    for (const entry of raw) {
        const normalized = normalizeOrigin(entry);
        if (normalized && !origins.includes(normalized)) origins.push(normalized);
    }
    return origins;
}

async function createSite(ctx, body) {
    const name = String(body.name ?? '').trim().slice(0, 120);
    if (!name) throw new HttpError(400, 'name_required', 'צריך לתת שם לאתר');
    const key = newSiteKey();
    const result = await run(ctx.db, `INSERT INTO sites
            (key, name, origins, moderation, allow_anonymous, comments_on, likes_on, locale, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        key, name, JSON.stringify(parseOrigins(body.origins)),
        body.moderation === 'post' ? 'post' : 'pre',
        body.allowAnonymous === false ? 0 : 1,
        body.commentsOn === false ? 0 : 1,
        body.likesOn === false ? 0 : 1,
        body.locale === 'en' ? 'en' : 'he',
        new Date().toISOString());

    const row = await siteById(ctx.db, result.meta.last_row_id);
    ctx.defer(logAudit(ctx.db, 'site.create', 'site', row.id, { name, key }));
    return json({ site: adminSite(row) }, { status: 201 });
}

async function updateSite(ctx, id, body) {
    const existing = await siteById(ctx.db, id);
    if (!existing) throw new HttpError(404, 'not_found', 'האתר לא נמצא');

    const next = {
        name: body.name !== undefined ? String(body.name).trim().slice(0, 120) || existing.name : existing.name,
        origins: body.origins !== undefined ? JSON.stringify(parseOrigins(body.origins)) : existing.origins,
        moderation: body.moderation !== undefined ? (body.moderation === 'post' ? 'post' : 'pre') : existing.moderation,
        allowAnonymous: body.allowAnonymous !== undefined ? (body.allowAnonymous ? 1 : 0) : existing.allow_anonymous,
        commentsOn: body.commentsOn !== undefined ? (body.commentsOn ? 1 : 0) : existing.comments_on,
        likesOn: body.likesOn !== undefined ? (body.likesOn ? 1 : 0) : existing.likes_on,
        locale: body.locale !== undefined ? (body.locale === 'en' ? 'en' : 'he') : existing.locale,
        active: body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
    };
    await run(ctx.db, `UPDATE sites SET name = ?, origins = ?, moderation = ?, allow_anonymous = ?,
                       comments_on = ?, likes_on = ?, locale = ?, active = ? WHERE id = ?`,
        next.name, next.origins, next.moderation, next.allowAnonymous,
        next.commentsOn, next.likesOn, next.locale, next.active, id);
    ctx.defer(logAudit(ctx.db, 'site.update', 'site', id, { name: next.name }));
    return json({ site: adminSite(await siteById(ctx.db, id)) });
}

/* Rotating the key silences every widget still using the old one — the way to
   cut off a site whose snippet leaked. */
async function rotateSiteKey(ctx, id) {
    if (!(await siteById(ctx.db, id))) throw new HttpError(404, 'not_found', 'האתר לא נמצא');
    await run(ctx.db, 'UPDATE sites SET key = ? WHERE id = ?', newSiteKey(), id);
    ctx.defer(logAudit(ctx.db, 'site.rotate_key', 'site', id, null));
    return json({ site: adminSite(await siteById(ctx.db, id)) });
}

async function deleteSite(ctx, id) {
    const existing = await siteById(ctx.db, id);
    if (!existing) throw new HttpError(404, 'not_found', 'האתר לא נמצא');
    /* D1 does not cascade unless foreign keys are on for the session, so the
       children go first and the site last. */
    await ctx.db.batch([
        ctx.db.prepare('DELETE FROM likes WHERE site_id = ?').bind(id),
        ctx.db.prepare('DELETE FROM comments WHERE site_id = ?').bind(id),
        ctx.db.prepare('DELETE FROM visitors WHERE site_id = ?').bind(id),
        ctx.db.prepare('DELETE FROM sites WHERE id = ?').bind(id),
    ]);
    ctx.defer(logAudit(ctx.db, 'site.delete', 'site', id, { name: existing.name }));
    return json({ ok: true });
}

/* ---- comments ---- */

function commentFilters(url) {
    const where = [];
    const args = [];
    const status = url.searchParams.get('status') || 'all';
    if (['pending', 'approved', 'rejected'].includes(status)) { where.push('c.status = ?'); args.push(status); }
    const siteId = num(url.searchParams.get('site'), 0);
    if (siteId) { where.push('c.site_id = ?'); args.push(siteId); }
    const search = (url.searchParams.get('q') || '').trim();
    if (search) {
        where.push('(c.body LIKE ? OR c.author_name LIKE ? OR c.author_email LIKE ? OR c.page_path LIKE ?)');
        const like = `%${search}%`;
        args.push(like, like, like, like);
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

async function listComments(ctx, url) {
    const { clause, args } = commentFilters(url);
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);
    const offset = Math.max(num(url.searchParams.get('offset'), 0), 0);
    const order = url.searchParams.get('order') === 'oldest' ? 'ASC' : 'DESC';

    const [rows, total, statusCounts] = await Promise.all([
        all(ctx.db, `SELECT c.*, s.name AS site_name, s.key AS site_key
                     FROM comments c JOIN sites s ON s.id = c.site_id
                     ${clause} ORDER BY c.created_at ${order} LIMIT ? OFFSET ?`, ...args, limit, offset),
        one(ctx.db, `SELECT COUNT(*) AS n FROM comments c ${clause}`, ...args),
        all(ctx.db, 'SELECT status, COUNT(*) AS n FROM comments GROUP BY status'),
    ]);

    const counts = statusCounts.reduce((acc, row) => ({ ...acc, [row.status]: row.n }),
        { pending: 0, approved: 0, rejected: 0 });

    return json({ comments: rows.map(adminComment), total: total.n, limit, offset, counts });
}

async function setCommentStatus(ctx, id, status) {
    if (!['pending', 'approved', 'rejected'].includes(status)) {
        throw new HttpError(400, 'bad_status', 'סטטוס לא מוכר');
    }
    const existing = await one(ctx.db, 'SELECT id FROM comments WHERE id = ?', id);
    if (!existing) throw new HttpError(404, 'not_found', 'התגובה לא נמצאה');
    await run(ctx.db, 'UPDATE comments SET status = ?, moderated_at = ? WHERE id = ?',
        status, new Date().toISOString(), id);
    ctx.defer(logAudit(ctx.db, `comment.${status}`, 'comment', id, null));
    const row = await one(ctx.db, `SELECT c.*, s.name AS site_name, s.key AS site_key
                                   FROM comments c JOIN sites s ON s.id = c.site_id WHERE c.id = ?`, id);
    return json({ comment: adminComment(row) });
}

async function deleteComment(ctx, id) {
    const existing = await one(ctx.db, 'SELECT * FROM comments WHERE id = ?', id);
    if (!existing) throw new HttpError(404, 'not_found', 'התגובה לא נמצאה');
    await run(ctx.db, 'DELETE FROM comments WHERE id = ?', id);
    ctx.defer(logAudit(ctx.db, 'comment.delete', 'comment', id, {
        site_id: existing.site_id, author: existing.author_name, body: existing.body.slice(0, 200),
    }));
    return json({ ok: true });
}

async function bulkComments(ctx, body) {
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => num(id, 0)).filter(Boolean) : [];
    if (!ids.length) throw new HttpError(400, 'no_ids', 'לא נבחרו תגובות');
    if (ids.length > 500) throw new HttpError(400, 'too_many', 'יותר מדי תגובות בפעולה אחת');
    const placeholders = ids.map(() => '?').join(',');

    if (body.action === 'delete') {
        await run(ctx.db, `DELETE FROM comments WHERE id IN (${placeholders})`, ...ids);
    } else if (['approve', 'reject', 'pending'].includes(body.action)) {
        const status = body.action === 'approve' ? 'approved' : body.action === 'reject' ? 'rejected' : 'pending';
        await run(ctx.db, `UPDATE comments SET status = ?, moderated_at = ? WHERE id IN (${placeholders})`,
            status, new Date().toISOString(), ...ids);
    } else {
        throw new HttpError(400, 'bad_action', 'פעולה לא מוכרת');
    }
    ctx.defer(logAudit(ctx.db, `comment.bulk_${body.action}`, 'comment', null, { count: ids.length }));
    return json({ ok: true, affected: ids.length });
}

function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

async function exportComments(ctx, url) {
    const siteId = num(url.searchParams.get('site'), 0);
    const rows = siteId
        ? await all(ctx.db, `SELECT c.*, s.name AS site_name FROM comments c JOIN sites s ON s.id = c.site_id
                             WHERE c.site_id = ? ORDER BY c.created_at DESC`, siteId)
        : await all(ctx.db, `SELECT c.*, s.name AS site_name FROM comments c JOIN sites s ON s.id = c.site_id
                             ORDER BY c.created_at DESC`);

    const lines = [['id', 'site', 'page', 'author', 'email', 'anonymous', 'status', 'score', 'created_at', 'body'].join(',')];
    for (const row of rows) {
        lines.push([
            row.id, row.site_name, row.page_path, row.author_name, row.author_email ?? '',
            row.is_anonymous ? 'yes' : 'no', row.status, row.spam_score, row.created_at, row.body,
        ].map(csvCell).join(','));
    }
    /* The BOM keeps Hebrew readable when the file is opened in Excel. */
    return new Response(`﻿${lines.join('\n')}`, {
        headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="comments.csv"',
        },
    });
}

/* ---- visitors, likes, settings, audit ---- */

async function listVisitors(ctx, url) {
    const where = [];
    const args = [];
    const siteId = num(url.searchParams.get('site'), 0);
    if (siteId) { where.push('v.site_id = ?'); args.push(siteId); }
    const search = (url.searchParams.get('q') || '').trim();
    if (search) {
        where.push('(v.email LIKE ? OR v.name LIKE ?)');
        args.push(`%${search}%`, `%${search}%`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);

    const rows = await all(ctx.db, `
        SELECT v.*, s.name AS site_name,
               (SELECT COUNT(*) FROM comments c WHERE c.visitor_id = v.id) AS comments,
               (SELECT COUNT(*) FROM likes l WHERE l.visitor_id = v.id) AS likes
        FROM visitors v JOIN sites s ON s.id = v.site_id
        ${clause} ORDER BY v.last_seen_at DESC LIMIT ?`, ...args, limit);

    return json({
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

/* Blocking stops new comments and likes, and hides what the visitor already
   wrote by pushing it back into the pending queue. */
async function setVisitorBlocked(ctx, id, blocked) {
    if (!(await one(ctx.db, 'SELECT id FROM visitors WHERE id = ?', id))) {
        throw new HttpError(404, 'not_found', 'המבקר לא נמצא');
    }
    await run(ctx.db, 'UPDATE visitors SET blocked = ? WHERE id = ?', blocked ? 1 : 0, id);
    if (blocked) {
        await run(ctx.db, `UPDATE comments SET status = 'pending', moderated_at = ?
                           WHERE visitor_id = ? AND status = 'approved'`, new Date().toISOString(), id);
    }
    ctx.defer(logAudit(ctx.db, blocked ? 'visitor.block' : 'visitor.unblock', 'visitor', id, null));
    return json({ ok: true });
}

async function listLikes(ctx, url) {
    const siteId = num(url.searchParams.get('site'), 0);
    const sql = `SELECT s.name AS site_name, s.key AS site_key, l.site_id, l.page_path,
                        MAX(l.page_title) AS page_title, MAX(l.page_url) AS page_url,
                        COUNT(*) AS likes, MAX(l.created_at) AS last_at
                 FROM likes l JOIN sites s ON s.id = l.site_id
                 ${siteId ? 'WHERE l.site_id = ?' : ''}
                 GROUP BY l.site_id, l.page_path ORDER BY likes DESC LIMIT 200`;
    const pages = siteId ? await all(ctx.db, sql, siteId) : await all(ctx.db, sql);
    return json({ pages });
}

async function readSettings(ctx) {
    let list = [];
    try { list = JSON.parse((await getSetting(ctx.db, 'blocklist')) || '[]'); } catch { list = []; }
    return json({
        blocklist: list,
        emailDnsCheck: ctx.config.emailDnsCheck,
        blockDisposableEmail: ctx.config.blockDisposableEmail,
        maxCommentLength: ctx.config.maxCommentLength,
    });
}

async function writeSettings(ctx, body) {
    if (body.blocklist !== undefined) {
        const list = Array.isArray(body.blocklist) ? body.blocklist : String(body.blocklist).split(/[\n,]+/);
        const cleaned = list.map((word) => String(word).trim()).filter(Boolean).slice(0, 500);
        await setSetting(ctx.db, 'blocklist', JSON.stringify(cleaned));
        ctx.defer(logAudit(ctx.db, 'settings.blocklist', 'settings', null, { count: cleaned.length }));
    }
    return readSettings(ctx);
}

async function listAudit(ctx, url) {
    const limit = Math.min(num(url.searchParams.get('limit'), 50), 200);
    return json({ entries: await all(ctx.db, 'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit) });
}

export async function handleAdminRoute(ctx, request, url) {
    if (!url.pathname.startsWith('/admin/api/')) return null;
    const route = url.pathname.slice('/admin/api'.length);
    const method = request.method;

    requireCsrfHeader(request);
    const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(request, ctx.config.bodyLimitBytes);

    /* Open endpoints: everything else needs a live session. */
    if (route === '/login' && method === 'POST') return login(ctx, request, body);
    if (route === '/session' && method === 'GET') return session(ctx, request);
    if (route === '/logout' && method === 'POST') return logout(ctx, request);

    await requireAdmin(ctx, request);

    if (route === '/password' && method === 'POST') return changePassword(ctx, body);
    if (route === '/overview' && method === 'GET') return overview(ctx);

    if (route === '/sites' && method === 'GET') return listSites(ctx);
    if (route === '/sites' && method === 'POST') return createSite(ctx, body);

    let match = route.match(/^\/sites\/(\d+)$/);
    if (match && method === 'PATCH') return updateSite(ctx, Number(match[1]), body);
    if (match && method === 'DELETE') return deleteSite(ctx, Number(match[1]));

    match = route.match(/^\/sites\/(\d+)\/rotate-key$/);
    if (match && method === 'POST') return rotateSiteKey(ctx, Number(match[1]));

    if (route === '/comments' && method === 'GET') return listComments(ctx, url);
    if (route === '/comments/bulk' && method === 'POST') return bulkComments(ctx, body);
    if (route === '/comments/export' && method === 'GET') return exportComments(ctx, url);

    match = route.match(/^\/comments\/(\d+)\/status$/);
    if (match && method === 'POST') return setCommentStatus(ctx, Number(match[1]), body.status);

    match = route.match(/^\/comments\/(\d+)$/);
    if (match && method === 'DELETE') return deleteComment(ctx, Number(match[1]));

    if (route === '/visitors' && method === 'GET') return listVisitors(ctx, url);
    match = route.match(/^\/visitors\/(\d+)\/block$/);
    if (match && method === 'POST') return setVisitorBlocked(ctx, Number(match[1]), body.blocked !== false);

    if (route === '/likes' && method === 'GET') return listLikes(ctx, url);
    if (route === '/settings' && method === 'GET') return readSettings(ctx);
    if (route === '/settings' && method === 'PATCH') return writeSettings(ctx, body);
    if (route === '/audit' && method === 'GET') return listAudit(ctx, url);

    return null;
}
