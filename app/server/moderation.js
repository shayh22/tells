/* Spam and abuse scoring. Nothing here rejects a comment on its own — a high
   score only forces it into the pending queue, where a human decides. The one
   exception is the honeypot, which no real visitor can trip. */

const LINK_RE = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/gi;

/* Words that almost always mark a comment as junk rather than opinion. The list
   is intentionally short; the dashboard is the real filter. */
const SPAM_PHRASES = [
    'viagra', 'cialis', 'casino', 'crypto giveaway', 'binary options', 'forex signals',
    'buy followers', 'seo services', 'cheap loans', 'work from home', 'make money fast',
    'הלוואה מיידית', 'הימורים', 'קזינו', 'רווח מהיר', 'קידום אתרים בזול',
];

/* Slurs and threats: the site owner extends this through the dashboard, so the
   built-in list stays small and uncontroversial. */
const DEFAULT_BLOCKLIST = [];

function countMatches(text, regex) {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
}

export function scoreComment({ body, authorName = '', isAnonymous = false, blocklist = DEFAULT_BLOCKLIST }) {
    const reasons = [];
    let score = 0;
    const text = String(body || '');
    const lower = text.toLowerCase();

    const links = countMatches(text, LINK_RE);
    if (links === 1) { score += 15; reasons.push('link'); }
    if (links > 1) { score += 25 + links * 10; reasons.push('many_links'); }

    for (const phrase of SPAM_PHRASES) {
        if (lower.includes(phrase)) { score += 45; reasons.push('spam_phrase'); break; }
    }

    for (const word of blocklist) {
        const needle = String(word || '').trim().toLowerCase();
        if (needle && lower.includes(needle)) { score += 70; reasons.push('blocklisted_word'); break; }
    }

    const letters = text.replace(/[^A-Za-z\u0590-\u05FF]/g, '');
    const uppercase = text.replace(/[^A-Z]/g, '');
    if (letters.length > 20 && uppercase.length / letters.length > 0.7) {
        score += 15; reasons.push('shouting');
    }

    if (/(.)\1{9,}/.test(text)) { score += 20; reasons.push('repeated_characters'); }
    if (text.length < 3) { score += 10; reasons.push('too_short'); }
    if (isAnonymous) { score += 5; reasons.push('anonymous'); }
    if (/https?:\/\//i.test(authorName)) { score += 40; reasons.push('link_in_name'); }

    return { score: Math.min(score, 100), reasons: [...new Set(reasons)] };
}

/* Post-moderation sites publish immediately, but a comment that looks like spam
   still waits for a human. */
export function decideStatus({ moderation, score, threshold = 40 }) {
    if (moderation === 'post' && score < threshold) return 'approved';
    return 'pending';
}

export function getBlocklist(getSettingValue) {
    try {
        const raw = getSettingValue('blocklist');
        if (!raw) return DEFAULT_BLOCKLIST;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, 500) : DEFAULT_BLOCKLIST;
    } catch {
        return DEFAULT_BLOCKLIST;
    }
}
