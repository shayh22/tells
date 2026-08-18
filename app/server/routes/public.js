/* The widget-facing API. Every route here is reachable cross-origin from the
   sites the owner registered, so each one re-checks the site key, the origin
   and the visitor token rather than trusting anything the page sends. */
import { HttpError, readJsonBody, sendJson } from '../util/http.js';
import { hashIp } from '../util/crypto.js';
import {
    cleanBody, cleanName, normalizePagePath, validateEmail,
} from '../util/validation.js';
import {
    createVisitor, findVisitorByEmail, findVisitorByToken, refreshVisitorToken,
    tokenFromRequest, touchVisitor,
} from '../auth.js';
import { decideStatus, getBlocklist, scoreComment } from '../moderation.js';
import { getSetting, logAudit } from '../db.js';
import { rateLimit } from '../ratelimit.js';

const ANON_NAME = { he: 'אנונימי', en: 'Anonymous' };

export function siteByKey(db, key) {
    if (!key) return null;
    return db.prepare('SELECT * FROM sites WHERE key = ? AND active = 1').get(String(key)) || null;
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

function assertOriginAllowed(req, site) {
    const origin = req.headers.origin;
    if (!origin) return; // same-origin fetch, curl, or a server-side call
    const allowed = allowedOriginsFor(site);
    if (allowed === '*' || allowed.includes(origin)) return;
    throw new HttpError(403, 'origin_not_allowed', 'הדומיין הזה אינו מורשה לאתר הזה');
}

function publicSite(site) {
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

function publicComment(row) {
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

function requireSite(db, key) {
    const site = siteByKey(db, key);
    if (!site) throw new HttpError(404, 'site_not_found', 'מפתח האתר אינו מוכר');
    return site;
}

function requireVisitor(ctx, req, body, site) {
    const token = tokenFromRequest(req, body);
    const visitor = findVisitorByToken(ctx.db, token);
    if (!visitor || visitor.site_id !== site.id) {
        throw new HttpError(401, 'identity_required', 'צריך להירשם לפני שליחה');
    }
    if (visitor.blocked) throw new HttpError(403, 'visitor_blocked', 'המשתמש הזה חסום');
    touchVisitor(ctx.db, visitor.id);
    return visitor;
}

function limitOr429(ctx, req, bucket, name) {
    const ip = ctx.ipOf(req);
    const result = rateLimit(`${name}:${ip}`, ctx.config.rateLimits[bucket]);
    if (!result.allowed) {
        throw new HttpError(429, 'rate_limited', 'יותר מדי בקשות, נסו שוב בעוד רגע', { retryAfter: result.retryAfter });
    }
}

/* ---- routes ---- */

async function getSiteConfig(ctx, req, res, url) {
    const site = requireSite(ctx.db, url.searchParams.get('site'));
    assertOriginAllowed(req, site);
    sendJson(res, 200, { site: publicSite(site) });
}

/* One-step registration. Email mode validates the address for real (syntax,
   disposable providers, live DNS); anonymous mode is allowed only when the site
   owner turned it on. */
async function registerVisitor(ctx, req, res, url, body) {
    limitOr429(ctx, req, 'register', 'register');
    const site = requireSite(ctx.db, body.site || url.searchParams.get('site'));
    assertOriginAllowed(req, site);

    const ipHash = hashIp(ctx.ipOf(req), ctx.ipSalt);
    const mode = body.mode === 'anonymous' ? 'anonymous' : 'email';
    const anonName = ANON_NAME[site.locale] || ANON_NAME.he;

    if (mode === 'anonymous') {
        if (!site.allow_anonymous) {
            throw new HttpError(403, 'anonymous_not_allowed', 'האתר הזה מחייב הרשמה עם אימייל');
        }
        const name = cleanName(body.name, anonName, ctx.config.maxNameLength);
        const { token, visitor } = createVisitor(ctx.db, {
            siteId: site.id, kind: 'anonymous', name, ipHash,
        });
        sendJson(res, 201, { token, visitor: shapeVisitor(visitor) });
        return;
    }

    const check = await validateEmail(body.email, {
        dnsCheck: ctx.config.emailDnsCheck,
        blockDisposable: ctx.config.blockDisposableEmail,
        timeoutMs: ctx.config.emailDnsTimeoutMs,
    });
    if (!check.ok) throw new HttpError(400, check.code, check.message);

    const fallbackName = check.email.split('@')[0].slice(0, ctx.config.maxNameLength);
    const name = cleanName(body.name, fallbackName, ctx.config.maxNameLength);

    const existing = findVisitorByEmail(ctx.db, site.id, check.email);
    if (existing) {
        if (existing.blocked) throw new HttpError(403, 'visitor_blocked', 'המשתמש הזה חסום');
        const { token, visitor } = refreshVisitorToken(ctx.db, existing.id, { name, ipHash });
        sendJson(res, 200, { token, visitor: shapeVisitor(visitor), returning: true });
        return;
    }

    const { token, visitor } = createVisitor(ctx.db, {
        siteId: site.id, kind: 'email', email: check.email, emailDomain: check.domain, name, ipHash,
    });
    logAudit(ctx.db, 'visitor.register', 'visitor', visitor.id, { site: site.key, kind: 'email' });
    sendJson(res, 201, { token, visitor: shapeVisitor(visitor) });
}

function shapeVisitor(visitor) {
    return {
        id: visitor.id,
        name: visitor.name,
        kind: visitor.kind,
        email: visitor.email,
    };
}

/* Returns the approved thread for one page, plus the caller's own pending
   comments so they can see that their message is waiting, not lost. */
async function listComments(ctx, req, res, url) {
    limitOr429(ctx, req, 'read', 'read');
    const site = requireSite(ctx.db, url.searchParams.get('site'));
    assertOriginAllowed(req, site);
    const page = normalizePagePath(url.searchParams.get('page'), url.searchParams.get('url'));

    const approved = ctx.db.prepare(
        `SELECT * FROM comments WHERE site_id = ? AND page_path = ? AND status = 'approved'
         ORDER BY created_at ASC LIMIT 500`).all(site.id, page);

    let mine = [];
    const token = tokenFromRequest(req, {});
    const visitor = findVisitorByToken(ctx.db, token);
    if (visitor && visitor.site_id === site.id) {
        mine = ctx.db.prepare(
            `SELECT * FROM comments WHERE site_id = ? AND page_path = ? AND visitor_id = ? AND status = 'pending'
             ORDER BY created_at ASC LIMIT 20`).all(site.id, page, visitor.id);
    }

    sendJson(res, 200, {
        site: publicSite(site),
        page,
        total: approved.length,
        comments: approved.map(publicComment),
        pending: mine.map(publicComment),
        visitor: visitor && visitor.site_id === site.id ? shapeVisitor(visitor) : null,
    });
}

async function createComment(ctx, req, res, url, body) {
    limitOr429(ctx, req, 'write', 'write');
    const site = requireSite(ctx.db, body.site || url.searchParams.get('site'));
    assertOriginAllowed(req, site);
    if (!site.comments_on) throw new HttpError(403, 'comments_disabled', 'התגובות סגורות באתר הזה');

    const visitor = requireVisitor(ctx, req, body, site);

    /* Hidden field no human fills in, plus a form that was submitted faster
       than a person can type. */
    if (typeof body.hp === 'string' && body.hp.trim() !== '') {
        throw new HttpError(400, 'rejected', 'הבקשה נדחתה');
    }

    const text = cleanBody(body.body, ctx.config.maxCommentLength);
    if (!text.ok) throw new HttpError(400, text.code, text.message);

    const page = normalizePagePath(body.page, body.pageUrl);
    const now = Date.now();

    const last = ctx.db.prepare(
        'SELECT created_at, body FROM comments WHERE visitor_id = ? ORDER BY id DESC LIMIT 1').get(visitor.id);
    if (last) {
        const since = now - new Date(last.created_at).getTime();
        if (since < ctx.config.commentCooldownMs) {
            throw new HttpError(429, 'too_fast', 'רגע לפני שליחת תגובה נוספת', {
                retryAfter: Math.ceil((ctx.config.commentCooldownMs - since) / 1000),
            });
        }
        if (last.body === text.body) {
            throw new HttpError(409, 'duplicate', 'כבר שלחתם את התגובה הזו');
        }
    }
    const hourAgo = new Date(now - 3600_000).toISOString();
    const recent = ctx.db.prepare(
        'SELECT COUNT(*) AS n FROM comments WHERE visitor_id = ? AND created_at > ?').get(visitor.id, hourAgo);
    if (recent.n >= ctx.config.commentsPerHour) {
        throw new HttpError(429, 'hourly_limit', 'הגעתם למכסת התגובות לשעה');
    }

    let parentId = null;
    if (body.parentId) {
        const parent = ctx.db.prepare(
            `SELECT id, parent_id FROM comments WHERE id = ? AND site_id = ? AND page_path = ? AND status = 'approved'`)
            .get(Number(body.parentId), site.id, page);
        if (!parent) throw new HttpError(400, 'parent_not_found', 'לא נמצאה התגובה שעליה מגיבים');
        /* Threads stay one level deep: a reply to a reply attaches to the root. */
        parentId = parent.parent_id ?? parent.id;
    }

    const isAnonymous = visitor.kind === 'anonymous';
    const anonName = ANON_NAME[site.locale] || ANON_NAME.he;
    const authorName = isAnonymous
        ? cleanName(body.name || visitor.name, anonName, ctx.config.maxNameLength)
        : cleanName(body.name || visitor.name, visitor.email.split('@')[0], ctx.config.maxNameLength);

    const blocklist = getBlocklist((key) => getSetting(ctx.db, key));
    const { score, reasons } = scoreComment({ body: text.body, authorName, isAnonymous, blocklist });
    const status = decideStatus({ moderation: site.moderation, score });

    const createdAt = new Date(now).toISOString();
    const info = ctx.db.prepare(`INSERT INTO comments
            (site_id, visitor_id, parent_id, page_path, page_url, page_title, author_name, author_email,
             is_anonymous, body, status, spam_score, spam_reasons, ip_hash, user_agent, created_at, moderated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
            site.id, visitor.id, parentId, page,
            typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 1024) : null,
            typeof body.pageTitle === 'string' ? body.pageTitle.slice(0, 300) : null,
            authorName, visitor.email ?? null, isAnonymous ? 1 : 0, text.body, status, score,
            JSON.stringify(reasons), hashIp(ctx.ipOf(req), ctx.ipSalt),
            String(req.headers['user-agent'] || '').slice(0, 300), createdAt,
            status === 'approved' ? createdAt : null,
        );

    const row = ctx.db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
    sendJson(res, 201, {
        status,
        message: status === 'approved' ? 'התגובה פורסמה' : 'התגובה נשלחה וממתינה לאישור',
        comment: publicComment(row),
    });
}

async function getLikes(ctx, req, res, url) {
    limitOr429(ctx, req, 'read', 'read');
    const site = requireSite(ctx.db, url.searchParams.get('site'));
    assertOriginAllowed(req, site);
    const page = normalizePagePath(url.searchParams.get('page'), url.searchParams.get('url'));

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM likes WHERE site_id = ? AND page_path = ?')
        .get(site.id, page);

    let liked = false;
    const visitor = findVisitorByToken(ctx.db, tokenFromRequest(req, {}));
    if (visitor && visitor.site_id === site.id) {
        liked = !!ctx.db.prepare('SELECT id FROM likes WHERE site_id = ? AND page_path = ? AND visitor_id = ?')
            .get(site.id, page, visitor.id);
    }
    sendJson(res, 200, { site: publicSite(site), page, count: n, liked });
}

/* Toggling is idempotent per visitor: a second call removes the like, so the
   widget can be a plain button with no client-side bookkeeping. */
async function toggleLike(ctx, req, res, url, body) {
    limitOr429(ctx, req, 'write', 'write');
    const site = requireSite(ctx.db, body.site || url.searchParams.get('site'));
    assertOriginAllowed(req, site);
    if (!site.likes_on) throw new HttpError(403, 'likes_disabled', 'הלייקים כבויים באתר הזה');

    const visitor = requireVisitor(ctx, req, body, site);
    const page = normalizePagePath(body.page, body.pageUrl);

    const existing = ctx.db.prepare('SELECT id FROM likes WHERE site_id = ? AND page_path = ? AND visitor_id = ?')
        .get(site.id, page, visitor.id);

    let liked;
    if (existing && body.action !== 'like') {
        ctx.db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
        liked = false;
    } else if (!existing) {
        ctx.db.prepare(`INSERT INTO likes (site_id, visitor_id, page_path, page_url, page_title, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)`)
            .run(site.id, visitor.id, page,
                typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 1024) : null,
                typeof body.pageTitle === 'string' ? body.pageTitle.slice(0, 300) : null,
                new Date().toISOString());
        liked = true;
    } else {
        liked = true;
    }

    const { n } = ctx.db.prepare('SELECT COUNT(*) AS n FROM likes WHERE site_id = ? AND page_path = ?')
        .get(site.id, page);
    sendJson(res, 200, { page, count: n, liked });
}

export async function handlePublicRoute(ctx, req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET') {
        if (pathname === '/api/v1/site') { await getSiteConfig(ctx, req, res, url); return true; }
        if (pathname === '/api/v1/comments') { await listComments(ctx, req, res, url); return true; }
        if (pathname === '/api/v1/likes') { await getLikes(ctx, req, res, url); return true; }
    }

    if (method === 'POST' && ['/api/v1/visitors', '/api/v1/comments', '/api/v1/likes'].includes(pathname)) {
        const body = await readJsonBody(req, ctx.config.bodyLimitBytes);
        if (pathname === '/api/v1/visitors') { await registerVisitor(ctx, req, res, url, body); return true; }
        if (pathname === '/api/v1/comments') { await createComment(ctx, req, res, url, body); return true; }
        await toggleLike(ctx, req, res, url, body);
        return true;
    }
    return false;
}
