/* Token and password primitives. Tokens are random and only their SHA-256 is
   stored, so a database leak never yields a usable session or visitor token. */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function randomToken(bytes = 32) {
    return randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
    return createHash('sha256').update(String(value)).digest('hex');
}

export function hashPassword(password) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
    if (typeof stored !== 'string') return false;
    const [scheme, salt, expected] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const derived = scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

export function hashIp(ip, salt) {
    if (!ip) return null;
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/* Public site keys are short enough to paste into a script tag by hand. */
export function newSiteKey() {
    return `st_${randomBytes(9).toString('base64url')}`;
}
