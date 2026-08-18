/* Email validation on Workers. The syntax and disposable-provider rules are the
   shared ones; the "does this domain accept mail" half uses DNS-over-HTTPS,
   because a Worker has no DNS resolver — only fetch. */
import { EMAIL_DOMAIN_UNREACHABLE, validateEmailShape } from '../../shared/validation.js';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const RECORD_TYPE = { MX: 15, A: 1 };
const NOERROR = 0;
const NXDOMAIN = 3;

/* Three answers, not two: a lookup that fails to complete is "unknown", and
   only a resolver that positively says the domain has no mail record counts as
   "no". Cloudflare caches the response at the edge, so a repeated domain costs
   nothing on the second visitor. */
async function lookup(domain, type, signal) {
    const response = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal,
    });
    if (!response.ok) return 'unknown';

    const answer = await response.json();
    if (answer.Status === NXDOMAIN) return 'no';
    if (answer.Status !== NOERROR) return 'unknown';
    return Array.isArray(answer.Answer) && answer.Answer.some((record) => record.type === RECORD_TYPE[type])
        ? 'yes'
        : 'no';
}

/* A resolver outage must never lock real visitors out of commenting, so
   anything short of a definitive "this domain has no mail" is accepted and
   left to moderation. */
async function domainAcceptsMail(domain, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const mx = await lookup(domain, 'MX', controller.signal);
        if (mx !== 'no') return true;
        /* Some small domains skip MX and deliver straight to the A record. */
        return (await lookup(domain, 'A', controller.signal)) !== 'no';
    } catch {
        return true;
    } finally {
        clearTimeout(timer);
    }
}

export async function validateEmail(rawEmail, { dnsCheck = true, blockDisposable = true, timeoutMs = 3000 } = {}) {
    const shape = validateEmailShape(rawEmail, { blockDisposable });
    if (!shape.ok || !dnsCheck) return shape;
    return (await domainAcceptsMail(shape.domain, timeoutMs)) ? shape : EMAIL_DOMAIN_UNREACHABLE;
}
