/* Cloudflare Worker entry point. The same three surfaces as the Node server:
   the cross-origin widget API under /api/v1, the dashboard API under
   /admin/api, and the static files — served here from the assets binding. */
import { HttpError, clientIp, corsHeaders, errorResponse, json, parseCookies, withHeaders } from './http.js';
import { allowedOriginsFor, ensureIpSalt, siteByKey } from './store.js';
import { purgeExpiredSessions } from './auth.js';
import { sweepRateHits } from './ratelimit.js';
import { handlePublicRoute } from './routes/public.js';
import { handleAdminRoute } from './routes/admin.js';

const bool = (value, fallback) => (value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()));
const int = (value, fallback) => (Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : fallback);

function readConfig(env) {
    return {
        emailDnsCheck: bool(env.EMAIL_DNS_CHECK, true),
        blockDisposableEmail: bool(env.BLOCK_DISPOSABLE_EMAIL, true),
        maxCommentLength: int(env.MAX_COMMENT_LENGTH, 2000),
        maxNameLength: 60,
        bodyLimitBytes: int(env.BODY_LIMIT_BYTES, 32 * 1024),
        commentCooldownMs: int(env.COMMENT_COOLDOWN_MS, 20_000),
        commentsPerHour: int(env.COMMENTS_PER_HOUR, 12),
        sessionTtlHours: int(env.SESSION_TTL_HOURS, 12),
        rateLimits: {
            write: { limit: int(env.RATE_WRITE, 20), windowMs: 60_000 },
            register: { limit: int(env.RATE_REGISTER, 10), windowMs: 10 * 60_000 },
            login: { limit: int(env.RATE_LOGIN, 10), windowMs: 10 * 60_000 },
        },
    };
}

/* The salt never changes, so one read per isolate is enough. */
let cachedSalt = null;

function asset(env, request, path) {
    const url = new URL(request.url);
    url.pathname = path;
    url.search = '';
    return env.ASSETS.fetch(new Request(url, { method: 'GET', headers: request.headers }));
}

async function route(ctx, request, url, env) {
    /* Widgets live on other domains, so the public API answers preflight and
       echoes only origins the site owner registered. */
    if (url.pathname.startsWith('/api/v1/')) {
        const site = await siteByKey(ctx.db, url.searchParams.get('site'));
        const cors = corsHeaders(request.headers.get('origin'), site ? allowedOriginsFor(site) : '*');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

        try {
            const response = await handlePublicRoute(ctx, request, url);
            return withHeaders(response ?? errorResponse(404, 'not_found', 'הנתיב לא נמצא'), cors);
        } catch (error) {
            if (error instanceof HttpError) {
                return errorResponse(error.status, error.code, error.message, error.extra, cors);
            }
            throw error;
        }
    }

    if (url.pathname.startsWith('/admin/api/')) {
        return (await handleAdminRoute(ctx, request, url)) ?? errorResponse(404, 'not_found', 'הנתיב לא נמצא');
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return errorResponse(405, 'method_not_allowed', 'שיטת הבקשה אינה נתמכת');
    }

    if (url.pathname === '/healthz') return json({ ok: true, runtime: 'cloudflare-workers' });

    /* The embed script is fetched by every visitor of every site, so it is
       cacheable and readable from anywhere. */
    if (url.pathname === '/embed.js') {
        return withHeaders(await asset(env, request, '/embed.js'), {
            'access-control-allow-origin': '*',
            'cache-control': 'public, max-age=300',
        });
    }

    /* The dashboard lives at /admin/ so its own relative asset paths resolve
       inside the dashboard directory. */
    if (url.pathname === '/admin') return Response.redirect(new URL('/admin/', url).toString(), 302);
    if (url.pathname.startsWith('/admin/')) {
        const rest = url.pathname.slice('/admin/'.length) || 'index.html';
        return asset(env, request, `/dashboard/${rest}`);
    }

    return env.ASSETS.fetch(request);
}

export default {
    async fetch(request, env, executionCtx) {
        const url = new URL(request.url);

        if (!env.DB) {
            return errorResponse(503, 'no_database',
                'לא מחוברת מסד נתונים D1. ראו את ההוראות ב־worker/README.md');
        }

        try {
            cachedSalt = cachedSalt || await ensureIpSalt(env.DB);
        } catch (error) {
            return errorResponse(503, 'schema_missing',
                'הטבלאות עדיין לא נוצרו. הריצו: npx wrangler d1 execute tells-engage --file schema.sql --remote');
        }

        const ip = clientIp(request);
        const ctx = {
            db: env.DB,
            env,
            config: readConfig(env),
            ip,
            ipKey: ip || 'unknown',
            ipSalt: cachedSalt,
            cookies: parseCookies,
            /* Bookkeeping writes (audit rows, last-seen stamps) must not hold
               the visitor's response open. */
            defer: (promise) => executionCtx.waitUntil(Promise.resolve(promise).catch(() => {})),
        };

        try {
            const response = await route(ctx, request, url, env);
            /* Cheap housekeeping, off the response path. */
            if (Math.random() < 0.01) {
                ctx.defer(Promise.all([purgeExpiredSessions(env.DB), sweepRateHits(env.DB)]));
            }
            return response;
        } catch (error) {
            if (error instanceof HttpError) {
                return errorResponse(error.status, error.code, error.message, error.extra);
            }
            console.error('unhandled error', error);
            return errorResponse(500, 'server_error', 'תקלה בשרת');
        }
    },
};
