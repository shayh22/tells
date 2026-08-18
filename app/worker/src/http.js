/* Response helpers. The Worker speaks the Fetch API, so these build Responses
   where the Node server wrote to a socket — the JSON shapes are identical, and
   the same widget and dashboard talk to both. */

export class HttpError extends Error {
    constructor(status, code, message, extra = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

export function json(payload, { status = 200, headers = {} } = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...headers,
        },
    });
}

export function errorResponse(status, code, message, extra = {}, headers = {}) {
    return json({ error: code, message, ...extra }, { status, headers });
}

export async function readJson(request, limitBytes = 32 * 1024) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > limitBytes) throw new HttpError(413, 'body_too_large', 'הבקשה גדולה מדי');
    const text = await request.text();
    if (text.length > limitBytes) throw new HttpError(413, 'body_too_large', 'הבקשה גדולה מדי');
    if (!text) return {};
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        throw new HttpError(400, 'invalid_json', 'גוף הבקשה אינו JSON תקין');
    }
}

export function parseCookies(request) {
    const header = request.headers.get('cookie');
    if (!header) return {};
    const out = {};
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
    return out;
}

/* Workers only serve HTTPS, so the session cookie is always Secure. */
export function cookieHeader(name, value, { maxAge } = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Secure'];
    if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
    return parts.join('; ');
}

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

export function withHeaders(response, headers) {
    const merged = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) merged.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

/* Cloudflare gives the real client address here; there is no proxy to trust or
   distrust, so no configuration flag is needed. */
export function clientIp(request) {
    return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || '';
}
