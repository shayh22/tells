/* Request router. Three surfaces share one process: the cross-origin widget API
   under /api/v1, the same-origin dashboard API under /admin/api, and the static
   files (dashboard, embed script, demo page). */
import http from 'node:http';
import path from 'node:path';
import { HttpError, clientIp, corsHeaders, parseCookies, sendError, sendJson, serveStatic } from './util/http.js';
import { ensureIpSalt, openDatabase, getSetting } from './db.js';
import { ensureAdminPassword, purgeExpiredSessions } from './auth.js';
import { allowedOriginsFor, handlePublicRoute, siteByKey } from './routes/public.js';
import { handleAdminRoute } from './routes/admin.js';

export function createApp(config) {
    const db = openDatabase(config.dbPath);
    const ipSalt = ensureIpSalt(db);
    const bootstrap = ensureAdminPassword(db, config.adminPassword);
    purgeExpiredSessions(db);

    const ctx = {
        db,
        config,
        ipSalt,
        ipOf: (req) => clientIp(req, config.trustProxy),
        cookies: (req) => parseCookies(req),
        setting: (key) => getSetting(db, key),
    };

    const server = http.createServer(async (req, res) => {
        let url;
        try {
            url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        } catch {
            sendError(res, 400, 'bad_request', 'בקשה לא תקינה');
            return;
        }

        try {
            /* Widgets live on other domains, so the public API answers preflight
               and echoes only origins the site owner registered. */
            if (url.pathname.startsWith('/api/v1/')) {
                const site = siteByKey(db, url.searchParams.get('site'));
                const allowed = site ? allowedOriginsFor(site) : '*';
                for (const [name, value] of Object.entries(corsHeaders(req.headers.origin, allowed))) {
                    res.setHeader(name, value);
                }
                if (req.method === 'OPTIONS') {
                    res.writeHead(204);
                    res.end();
                    return;
                }
                if (await handlePublicRoute(ctx, req, res, url)) return;
                sendError(res, 404, 'not_found', 'הנתיב לא נמצא');
                return;
            }

            if (url.pathname.startsWith('/admin/api/')) {
                if (await handleAdminRoute(ctx, req, res, url)) return;
                sendError(res, 404, 'not_found', 'הנתיב לא נמצא');
                return;
            }

            if (req.method !== 'GET' && req.method !== 'HEAD') {
                sendError(res, 405, 'method_not_allowed', 'שיטת הבקשה אינה נתמכת');
                return;
            }

            if (url.pathname === '/healthz') {
                sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
                return;
            }

            /* The embed script is fetched by every visitor of every site, so it
               is cacheable and readable from anywhere. */
            if (url.pathname === '/embed.js') {
                res.setHeader('access-control-allow-origin', '*');
                if (serveStatic(res, config.publicDir, 'embed.js', { cacheSeconds: 300 })) return;
            }

            /* The dashboard lives at /admin/ so its own relative asset paths
               resolve inside the dashboard directory. */
            if (url.pathname === '/admin') {
                res.writeHead(302, { location: '/admin/' });
                res.end();
                return;
            }
            if (url.pathname.startsWith('/admin/')) {
                const relative = decodeURIComponent(url.pathname.slice('/admin/'.length)) || 'index.html';
                if (serveStatic(res, config.publicDir, path.join('dashboard', relative))) return;
            }
            if (url.pathname === '/') {
                if (serveStatic(res, config.publicDir, 'index.html')) return;
            }

            const asset = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
            if (asset && serveStatic(res, config.publicDir, asset)) return;

            sendError(res, 404, 'not_found', 'הדף לא נמצא');
        } catch (error) {
            if (error instanceof HttpError) {
                sendError(res, error.status, error.code, error.message, error.extra);
                return;
            }
            console.error('[engage] unhandled error', error);
            if (!res.headersSent) sendError(res, 500, 'server_error', 'תקלה בשרת');
            else res.end();
        }
    });

    /* Expired sessions are cheap to sweep and keep the table honest. */
    const sweeper = setInterval(() => purgeExpiredSessions(db), 30 * 60_000);
    sweeper.unref?.();

    return {
        server,
        db,
        bootstrap,
        close: () => new Promise((resolve) => {
            clearInterval(sweeper);
            server.close(() => {
                db.close();
                resolve();
            });
        }),
    };
}
