/* WebCrypto equivalents of the Node server's token and password primitives.
   Workers have no node:crypto, so scrypt becomes PBKDF2-SHA256 — the only
   password KDF crypto.subtle offers. */

const encoder = new TextEncoder();

/* PBKDF2 runs on the request's CPU budget, so the count is tuned for a login
   that happens rarely rather than for a password database. */
const PBKDF2_ITERATIONS = 50_000;

function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(buffer) {
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

export function randomToken(bytes = 32) {
    return toBase64Url(randomBytes(bytes));
}

export async function sha256(value) {
    return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

async function derive(password, salt) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
        key,
        256,
    );
    return toHex(bits);
}

export async function hashPassword(password) {
    const salt = randomBytes(16);
    return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${await derive(password, salt)}`;
}

export async function verifyPassword(password, stored) {
    if (typeof stored !== 'string') return false;
    const [scheme, iterations, saltHex, expected] = stored.split('$');
    if (scheme !== 'pbkdf2' || !saltHex || !expected) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: Number(iterations) || PBKDF2_ITERATIONS },
        key,
        256,
    );
    return timingSafeEqual(toHex(bits), expected);
}

/* Constant-time comparison: the loop always runs the full length so a wrong
   password never leaks how much of the hash matched. */
export function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export async function hashIp(ip, salt) {
    if (!ip) return null;
    return (await sha256(`${salt}:${ip}`)).slice(0, 32);
}

export function newSiteKey() {
    return `st_${toBase64Url(randomBytes(9))}`;
}
