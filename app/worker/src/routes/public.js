/* The widget-facing API on Workers. Route for route and response for response
   this matches the Node server, so one embed.js serves both deployments. */
import { HttpError, json, readJson } from '../http.js';
import { hashIp } from '../crypto.js';
import { cleanBody, cleanName, normalizePagePath } from '../../../shared/validation.js';
import { decideStatus, scoreComment } from '../../../shared/moderation.js';
import { validateEmail } from '../email.js';
import {
    createVisitor, findVisitorByEmail, findVisitorByToken, refreshVisitorToken, tokenFromRequest, touchVisitor,
} from '../auth.js';
import {
    all, allowedOriginsFor, blocklist, logAudit, one, publicComment, publicSite, run, shapeVisitor, siteByKey,
} from '../store.js';
import { limitOr429 } from '../ratelimit.js';

const ANON_NAME = { he: 'אנונימי', en: 'Anonymous' };

async function requireSite(ctx, key) {
    const site = await siteByKey(ctx.db, key);
    if (!site) throw new HttpError(404, 'site_not_found', 'מפתח האתר אינו מוכר');
    return site;
}

function assertOriginAllowed(request, site) {
    const origin = request.headers.get('origin');
    if (!origin) return; // same-origin fetch, curl, or a server-side call
    const allowed = allowedOriginsFor(site);
    if (allowed === '*' || allowed.includes(origin)) return;
    throw new HttpError(403, 'origin_not_allowed', 'הדומיין הזה אינו מורשה לאתר הזה');
}

async function requireVisitor(ctx, request, body, site) {
    const visitor = await findVisitorByToken(ctx.db, tokenFromRequest(request, body));
    if (!visitor || visitor.site_id !== site.id) {
        throw new HttpError(401, 'identity_required', 'צריך להירשם לפני שליחה');
    }
    if (visitor.blocked) throw new HttpError(403, 'visitor_blocked', 'המשתמש הזה חסום');
    ctx.defer(touchVisitor(ctx.db, visitor.id));
    return visitor;
}

/* ---- routes ---- */

async function getSiteConfig(ctx, request, url) {
    const site = await requireSite(ctx, url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    return json({ site: publicSite(site) });
}

/* One-step registration: a real email address (syntax, disposable providers,
   live DNS over DoH), or an anonymous identity when the site allows it. */
async function registerVisitor(ctx, request, url, body) {
    const site = await requireSite(ctx, body.site || url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    await limitOr429(ctx.db, 'register', ctx.ipKey, ctx.config.rateLimits.register);

    const ipHash = await hashIp(ctx.ip, ctx.ipSalt);
    const anonName = ANON_NAME[site.locale] || ANON_NAME.he;

    if (body.mode === 'anonymous') {
        if (!site.allow_anonymous) {
            throw new HttpError(403, 'anonymous_not_allowed', 'האתר הזה מחייב הרשמה עם אימייל');
        }
        const { token, visitor } = await createVisitor(ctx.db, {
            siteId: site.id,
            kind: 'anonymous',
            name: cleanName(body.name, anonName, ctx.config.maxNameLength),
            ipHash,
        });
        return json({ token, visitor: shapeVisitor(visitor) }, { status: 201 });
    }

    const check = await validateEmail(body.email, {
        dnsCheck: ctx.config.emailDnsCheck,
        blockDisposable: ctx.config.blockDisposableEmail,
    });
    if (!check.ok) throw new HttpError(400, check.code, check.message);

    const name = cleanName(body.name, check.email.split('@')[0], ctx.config.maxNameLength);
    const existing = await findVisitorByEmail(ctx.db, site.id, check.email);
    if (existing) {
        if (existing.blocked) throw new HttpError(403, 'visitor_blocked', 'המשתמש הזה חסום');
        const { token, visitor } = await refreshVisitorToken(ctx.db, existing.id, { name, ipHash });
        return json({ token, visitor: shapeVisitor(visitor), returning: true });
    }

    const { token, visitor } = await createVisitor(ctx.db, {
        siteId: site.id, kind: 'email', email: check.email, emailDomain: check.domain, name, ipHash,
    });
    ctx.defer(logAudit(ctx.db, 'visitor.register', 'visitor', visitor.id, { site: site.key, kind: 'email' }));
    return json({ token, visitor: shapeVisitor(visitor) }, { status: 201 });
}

/* The approved thread for one page, plus the caller's own pending comments so
   they can see that their message is waiting, not lost. */
async function listComments(ctx, request, url) {
    const site = await requireSite(ctx, url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    const page = normalizePagePath(url.searchParams.get('page'), url.searchParams.get('url'));

    const approved = await all(ctx.db,
        `SELECT * FROM comments WHERE site_id = ? AND page_path = ? AND status = 'approved'
         ORDER BY created_at ASC LIMIT 500`, site.id, page);

    let mine = [];
    const visitor = await findVisitorByToken(ctx.db, tokenFromRequest(request));
    const isOurs = visitor && visitor.site_id === site.id;
    if (isOurs) {
        mine = await all(ctx.db,
            `SELECT * FROM comments WHERE site_id = ? AND page_path = ? AND visitor_id = ? AND status = 'pending'
             ORDER BY created_at ASC LIMIT 20`, site.id, page, visitor.id);
    }

    return json({
        site: publicSite(site),
        page,
        total: approved.length,
        comments: approved.map(publicComment),
        pending: mine.map(publicComment),
        visitor: isOurs ? shapeVisitor(visitor) : null,
    });
}

async function createComment(ctx, request, url, body) {
    const site = await requireSite(ctx, body.site || url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    if (!site.comments_on) throw new HttpError(403, 'comments_disabled', 'התגובות סגורות באתר הזה');
    await limitOr429(ctx.db, 'write', ctx.ipKey, ctx.config.rateLimits.write);

    const visitor = await requireVisitor(ctx, request, body, site);

    /* Hidden field no human fills in. */
    if (typeof body.hp === 'string' && body.hp.trim() !== '') {
        throw new HttpError(400, 'rejected', 'הבקשה נדחתה');
    }

    const text = cleanBody(body.body, ctx.config.maxCommentLength);
    if (!text.ok) throw new HttpError(400, text.code, text.message);

    const page = normalizePagePath(body.page, body.pageUrl);
    const now = Date.now();

    const last = await one(ctx.db,
        'SELECT created_at, body FROM comments WHERE visitor_id = ? ORDER BY id DESC LIMIT 1', visitor.id);
    if (last) {
        const since = now - new Date(last.created_at).getTime();
        if (since < ctx.config.commentCooldownMs) {
            throw new HttpError(429, 'too_fast', 'רגע לפני שליחת תגובה נוספת', {
                retryAfter: Math.ceil((ctx.config.commentCooldownMs - since) / 1000),
            });
        }
        if (last.body === text.body) throw new HttpError(409, 'duplicate', 'כבר שלחתם את התגובה הזו');
    }
    const recent = await one(ctx.db, 'SELECT COUNT(*) AS n FROM comments WHERE visitor_id = ? AND created_at > ?',
        visitor.id, new Date(now - 3600_000).toISOString());
    if (recent.n >= ctx.config.commentsPerHour) {
        throw new HttpError(429, 'hourly_limit', 'הגעתם למכסת התגובות לשעה');
    }

    let parentId = null;
    if (body.parentId) {
        const parent = await one(ctx.db,
            `SELECT id, parent_id FROM comments WHERE id = ? AND site_id = ? AND page_path = ? AND status = 'approved'`,
            Number(body.parentId), site.id, page);
        if (!parent) throw new HttpError(400, 'parent_not_found', 'לא נמצאה התגובה שעליה מגיבים');
        /* Threads stay one level deep: a reply to a reply attaches to the root. */
        parentId = parent.parent_id ?? parent.id;
    }

    const isAnonymous = visitor.kind === 'anonymous';
    const anonName = ANON_NAME[site.locale] || ANON_NAME.he;
    const authorName = cleanName(
        body.name || visitor.name,
        isAnonymous ? anonName : visitor.email.split('@')[0],
        ctx.config.maxNameLength,
    );

    const { score, reasons } = scoreComment({
        body: text.body, authorName, isAnonymous, blocklist: await blocklist(ctx.db),
    });
    const status = decideStatus({ moderation: site.moderation, score });
    const createdAt = new Date(now).toISOString();

    const result = await run(ctx.db, `INSERT INTO comments
            (site_id, visitor_id, parent_id, page_path, page_url, page_title, author_name, author_email,
             is_anonymous, body, status, spam_score, spam_reasons, ip_hash, user_agent, created_at, moderated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        site.id, visitor.id, parentId, page,
        typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 1024) : null,
        typeof body.pageTitle === 'string' ? body.pageTitle.slice(0, 300) : null,
        authorName, visitor.email ?? null, isAnonymous ? 1 : 0, text.body, status, score,
        JSON.stringify(reasons), await hashIp(ctx.ip, ctx.ipSalt),
        (request.headers.get('user-agent') || '').slice(0, 300), createdAt,
        status === 'approved' ? createdAt : null);

    const row = await one(ctx.db, 'SELECT * FROM comments WHERE id = ?', result.meta.last_row_id);
    return json({
        status,
        message: status === 'approved' ? 'התגובה פורסמה' : 'התגובה נשלחה וממתינה לאישור',
        comment: publicComment(row),
    }, { status: 201 });
}

async function getLikes(ctx, request, url) {
    const site = await requireSite(ctx, url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    const page = normalizePagePath(url.searchParams.get('page'), url.searchParams.get('url'));

    const { n } = await one(ctx.db, 'SELECT COUNT(*) AS n FROM likes WHERE site_id = ? AND page_path = ?',
        site.id, page);

    let liked = false;
    const visitor = await findVisitorByToken(ctx.db, tokenFromRequest(request));
    if (visitor && visitor.site_id === site.id) {
        liked = !!(await one(ctx.db, 'SELECT id FROM likes WHERE site_id = ? AND page_path = ? AND visitor_id = ?',
            site.id, page, visitor.id));
    }
    return json({ site: publicSite(site), page, count: n, liked });
}

/* Toggling is idempotent per visitor, so the widget can be a plain button with
   no client-side bookkeeping. */
async function toggleLike(ctx, request, url, body) {
    const site = await requireSite(ctx, body.site || url.searchParams.get('site'));
    assertOriginAllowed(request, site);
    if (!site.likes_on) throw new HttpError(403, 'likes_disabled', 'הלייקים כבויים באתר הזה');
    await limitOr429(ctx.db, 'write', ctx.ipKey, ctx.config.rateLimits.write);

    const visitor = await requireVisitor(ctx, request, body, site);
    const page = normalizePagePath(body.page, body.pageUrl);

    const existing = await one(ctx.db, 'SELECT id FROM likes WHERE site_id = ? AND page_path = ? AND visitor_id = ?',
        site.id, page, visitor.id);

    let liked;
    if (existing && body.action !== 'like') {
        await run(ctx.db, 'DELETE FROM likes WHERE id = ?', existing.id);
        liked = false;
    } else if (!existing) {
        await run(ctx.db, `INSERT INTO likes (site_id, visitor_id, page_path, page_url, page_title, created_at)
                           VALUES (?, ?, ?, ?, ?, ?)`,
            site.id, visitor.id, page,
            typeof body.pageUrl === 'string' ? body.pageUrl.slice(0, 1024) : null,
            typeof body.pageTitle === 'string' ? body.pageTitle.slice(0, 300) : null,
            new Date().toISOString());
        liked = true;
    } else {
        liked = true;
    }

    const { n } = await one(ctx.db, 'SELECT COUNT(*) AS n FROM likes WHERE site_id = ? AND page_path = ?',
        site.id, page);
    return json({ page, count: n, liked });
}

export async function handlePublicRoute(ctx, request, url) {
    const path = url.pathname;
    const method = request.method;

    if (method === 'GET') {
        if (path === '/api/v1/site') return getSiteConfig(ctx, request, url);
        if (path === '/api/v1/comments') return listComments(ctx, request, url);
        if (path === '/api/v1/likes') return getLikes(ctx, request, url);
    }

    if (method === 'POST' && ['/api/v1/visitors', '/api/v1/comments', '/api/v1/likes'].includes(path)) {
        const body = await readJson(request, ctx.config.bodyLimitBytes);
        if (path === '/api/v1/visitors') return registerVisitor(ctx, request, url, body);
        if (path === '/api/v1/comments') return createComment(ctx, request, url, body);
        return toggleLike(ctx, request, url, body);
    }
    return null;
}
