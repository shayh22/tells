/* The Node server's email check: the shared rules plus a live DNS lookup, so a
   typo like "gmial.com" is caught before the comment is ever stored. */
import dns from 'node:dns/promises';
import { EMAIL_DOMAIN_UNREACHABLE, validateEmailShape } from '../../shared/validation.js';

export {
    checkEmailSyntax, cleanBody, cleanName, isDisposableDomain,
    normalizeEmail, normalizeOrigin, normalizePagePath, validateEmailShape,
} from '../../shared/validation.js';

const dnsCache = new Map(); // domain -> { ok, at }
const DNS_TTL_MS = 60 * 60 * 1000;

/* Three answers, not two: only a resolver that positively says the domain does
   not exist (or holds no mail record) counts as "no". A timeout or a failing
   resolver is "unknown" — a DNS outage must never lock real visitors out of
   commenting. */
async function lookup(resolve, domain, timeoutMs) {
    const withTimeout = (promise) => Promise.race([
        promise,
        new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('dns_timeout')), timeoutMs);
            timer.unref?.();
        }),
    ]);
    try {
        const records = await withTimeout(resolve(domain));
        return Array.isArray(records) && records.length ? 'yes' : 'no';
    } catch (error) {
        /* ENOTFOUND: no such domain. ENODATA: the domain exists but has no
           record of this type. Everything else is a resolver problem. */
        return error.code === 'ENOTFOUND' || error.code === 'ENODATA' ? 'no' : 'unknown';
    }
}

async function domainAcceptsMail(domain, timeoutMs) {
    const cached = dnsCache.get(domain);
    if (cached && Date.now() - cached.at < DNS_TTL_MS) return cached.ok;

    let ok = (await lookup((name) => dns.resolveMx(name), domain, timeoutMs)) !== 'no';
    if (!ok) {
        /* Some small domains skip MX and deliver straight to the A record. */
        ok = (await lookup((name) => dns.resolve4(name), domain, timeoutMs)) !== 'no';
    }
    dnsCache.set(domain, { ok, at: Date.now() });
    return ok;
}

export async function validateEmail(rawEmail, { dnsCheck = true, blockDisposable = true, timeoutMs = 3000 } = {}) {
    const shape = validateEmailShape(rawEmail, { blockDisposable });
    if (!shape.ok || !dnsCheck) return shape;
    return (await domainAcceptsMail(shape.domain, timeoutMs)) ? shape : EMAIL_DOMAIN_UNREACHABLE;
}
