/* Small HTTP helpers shared by the public API, the admin API and the static
   file handler. Kept deliberately thin: node:http is the whole framework. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
};

export function sendJson(res, status, payload, headers = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control': 'no-store',
        ...headers,
    });
    res.end(body);
}

export function sendError(res, status, code, message, extra = {}) {
    sendJson(res, status, { error: code, message, ...extra });
}

export class HttpError extends Error {
    constructor(status, code, message, extra = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

export async function readJsonBody(req, limitBytes) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > limitBytes) throw new HttpError(413, 'body_too_large', 'הבקשה גדולה מדי');
        chunks.push(chunk);
    }
    if (!size) return {};
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        throw new HttpError(400, 'invalid_json', 'גוף הבקשה אינו JSON תקין');
    }
}

export function parseCookies(req) {
    const header = req.headers.cookie;
    if (!header) return {};
    const out = {};
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}

export function cookieHeader(name, value, { maxAge, secure, sameSite = 'Strict', path: cookiePath = '/' } = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`, 'HttpOnly', `SameSite=${sameSite}`];
    if (secure) parts.push('Secure');
    if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
    return parts.join('; ');
}

export function clientIp(req, trustProxy) {
    if (trustProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (typeof forwarded === 'string' && forwarded.length) {
            return forwarded.split(',')[0].trim();
        }
    }
    return req.socket.remoteAddress || '';
}

/* Widgets run on other people's pages, so every public endpoint answers with
   CORS headers scoped to the origins registered for that site. */
export function corsHeaders(origin, allowed) {
    const headers = {
        'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type,authorization',
        'access-control-max-age': '600',
        vary: 'Origin',
    };
    if (allowed === '*') {
        headers['access-control-allow-origin'] = origin || '*';
    } else if (origin && allowed.includes(origin)) {
        headers['access-control-allow-origin'] = origin;
    }
    return headers;
}

export function serveStatic(res, baseDir, relativePath, { cacheSeconds = 0 } = {}) {
    const target = path.join(baseDir, relativePath);
    /* Reject anything that escapes the public directory before touching disk. */
    if (!target.startsWith(path.resolve(baseDir) + path.sep) && target !== path.resolve(baseDir)) {
        sendError(res, 403, 'forbidden', 'גישה נדחתה');
        return true;
    }
    let stat;
    try {
        stat = fs.statSync(target);
    } catch {
        return false;
    }
    if (stat.isDirectory()) return serveStatic(res, baseDir, path.join(relativePath, 'index.html'), { cacheSeconds });

    const etag = `"${createHash('sha1').update(`${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 16)}"`;
    if (res.req && res.req.headers['if-none-match'] === etag) {
        res.writeHead(304, { etag, 'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-cache' });
        res.end();
        return true;
    }
    const headers = {
        'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'content-length': stat.size,
        etag,
        'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-cache',
    };
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
    return true;
}
