/* Pure input validation, shared by the Node server and the Cloudflare Worker.
   Nothing here touches the network or a Node built-in, so both runtimes — and
   the tests — use exactly the same rules. */

/* Deliberately narrower than RFC 5322: no quoted local parts, no IP literals,
   no consecutive dots. Everything it rejects is something a real signup form
   never sees. */
const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com',
    'yopmail.com', 'yopmail.fr', 'temp-mail.org', 'tempmail.com', 'trashmail.com',
    '10minutemail.com', '10minutemail.net', 'throwawaymail.com', 'getnada.com',
    'dispostable.com', 'maildrop.cc', 'fakeinbox.com', 'mailnesia.com', 'mohmal.com',
    'spamgourmet.com', 'tempr.email', 'discard.email', 'emailondeck.com', 'moakt.com',
    'mintemail.com', 'inboxbear.com', 'tempmailo.com', 'anonaddy.me', 'burnermail.io',
]);

/* Domains that resolve but never accept mail. */
const NON_MAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'localhost', 'test', 'invalid']);

const dnsCache = new Map(); // domain -> { ok, at }
const DNS_TTL_MS = 60 * 60 * 1000;

export function normalizeEmail(raw) {
    return String(raw ?? '').trim().toLowerCase();
}

export function checkEmailSyntax(email) {
    if (!email) return { ok: false, code: 'email_required', message: 'נדרשת כתובת אימייל' };
    if (email.length > 254) return { ok: false, code: 'email_too_long', message: 'כתובת האימייל ארוכה מדי' };
    if (email.includes('..')) return { ok: false, code: 'email_invalid', message: 'כתובת האימייל אינה תקינה' };
    if (!EMAIL_RE.test(email)) return { ok: false, code: 'email_invalid', message: 'כתובת האימייל אינה תקינה' };
    const [local, domain] = email.split('@');
    if (local.length > 64) return { ok: false, code: 'email_invalid', message: 'כתובת האימייל אינה תקינה' };
    return { ok: true, local, domain };
}

/* Everything except the live DNS lookup, which each runtime does its own way:
   node:dns on the server, DNS-over-HTTPS on the Worker. */
export function validateEmailShape(rawEmail, { blockDisposable = true } = {}) {
    const email = normalizeEmail(rawEmail);
    const syntax = checkEmailSyntax(email);
    if (!syntax.ok) return syntax;
    const { domain } = syntax;

    if (NON_MAIL_DOMAINS.has(domain)) {
        return { ok: false, code: 'email_domain_invalid', message: 'הדומיין של כתובת האימייל אינו מקבל דואר' };
    }
    if (blockDisposable && DISPOSABLE_DOMAINS.has(domain)) {
        return { ok: false, code: 'email_disposable', message: 'כתובות אימייל זמניות אינן מתקבלות' };
    }
    return { ok: true, email, domain };
}

export const EMAIL_DOMAIN_UNREACHABLE = {
    ok: false,
    code: 'email_domain_unreachable',
    message: 'לא נמצא שרת דואר לדומיין הזה — בדקו את הכתובת',
};

export function isDisposableDomain(domain) {
    return DISPOSABLE_DOMAINS.has(String(domain || '').toLowerCase());
}

/* Names are stored as plain text and escaped at render time; here we only trim
   the shape so the dashboard and widget stay readable. */
export function cleanName(raw, fallback, maxLength = 60) {
    const name = String(raw ?? '')
        .replace(/[\u0000-\u001f<>]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return name || fallback;
}

export function cleanBody(raw, maxLength) {
    const body = String(raw ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!body) return { ok: false, code: 'body_required', message: 'לא ניתן לשלוח תגובה ריקה' };
    if (body.length > maxLength) {
        return { ok: false, code: 'body_too_long', message: `התגובה ארוכה מדי (מקסימום ${maxLength} תווים)` };
    }
    return { ok: true, body };
}

/* One page identity per URL: the path, without query strings or fragments, so
   "/story-1.html?utm=x" and "/story-1.html" share a thread. */
export function normalizePagePath(raw, fallbackUrl) {
    let value = String(raw ?? '').trim();
    if (!value && fallbackUrl) value = String(fallbackUrl);
    if (!value) return '/';
    try {
        if (/^https?:\/\//i.test(value)) value = new URL(value).pathname;
    } catch { /* fall through and treat it as a path */ }
    value = value.split('#')[0].split('?')[0];
    if (!value.startsWith('/')) value = `/${value}`;
    value = value.replace(/\/{2,}/g, '/');
    if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
    return value.slice(0, 512) || '/';
}

export function normalizeOrigin(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    if (value === '*') return '*';
    try {
        const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
        return url.origin;
    } catch {
        return null;
    }
}
