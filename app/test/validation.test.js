import test from 'node:test';
import assert from 'node:assert/strict';
import {
    checkEmailSyntax, cleanBody, cleanName, normalizeEmail, normalizeOrigin, normalizePagePath, validateEmail,
} from '../server/util/validation.js';
import { decideStatus, scoreComment } from '../shared/moderation.js';

test('email syntax accepts real addresses and rejects the usual junk', () => {
    const valid = ['a@b.co', 'first.last@sub.domain.org', 'user+tag@gmail.com', 'שם@example.com'.replace('שם', 'name')];
    for (const email of valid) {
        assert.equal(checkEmailSyntax(normalizeEmail(email)).ok, true, email);
    }
    const invalid = ['', 'plain', 'no@tld', 'two@@at.com', 'a..b@x.com', 'space in@x.com', 'trailing@x.com.'];
    for (const email of invalid) {
        assert.equal(checkEmailSyntax(normalizeEmail(email)).ok, false, email);
    }
});

test('validateEmail lowercases, blocks disposables and can skip DNS', async () => {
    const ok = await validateEmail('  Reader@Gmail.COM ', { dnsCheck: false });
    assert.equal(ok.ok, true);
    assert.equal(ok.email, 'reader@gmail.com');

    const disposable = await validateEmail('x@yopmail.com', { dnsCheck: false });
    assert.equal(disposable.code, 'email_disposable');

    const placeholder = await validateEmail('x@example.com', { dnsCheck: false });
    assert.equal(placeholder.code, 'email_domain_invalid');
});

test('page paths collapse to one identity per page', () => {
    assert.equal(normalizePagePath('/story-1.html?utm=x#top'), '/story-1.html');
    assert.equal(normalizePagePath('https://example.com/a/b/'), '/a/b');
    assert.equal(normalizePagePath('no-slash'), '/no-slash');
    assert.equal(normalizePagePath(''), '/');
    assert.equal(normalizePagePath('//double//slash'), '/double/slash');
});

test('names and bodies are trimmed rather than trusted', () => {
    assert.equal(cleanName('  <script>alert(1)</script>  ', 'ברירת מחדל'), 'script alert(1) /script');
    assert.equal(cleanName('', 'ברירת מחדל'), 'ברירת מחדל');
    assert.equal(cleanBody('   ', 100).ok, false);
    assert.equal(cleanBody('x'.repeat(101), 100).ok, false);
    assert.equal(cleanBody('שורה\n\n\n\nשורה', 100).body, 'שורה\n\nשורה');
});

test('origins normalize to a comparable form', () => {
    assert.equal(normalizeOrigin('example.com'), 'https://example.com');
    assert.equal(normalizeOrigin('https://example.com/path'), 'https://example.com');
    assert.equal(normalizeOrigin('http://localhost:3000'), 'http://localhost:3000');
    assert.equal(normalizeOrigin('   '), null);
});

test('spam scoring separates opinion from junk', () => {
    const clean = scoreComment({ body: 'תגובה רגילה על הסיפור' });
    assert.equal(clean.score, 0);
    assert.equal(decideStatus({ moderation: 'post', score: clean.score }), 'approved');

    const junk = scoreComment({ body: 'buy viagra http://a.example http://b.example' });
    assert.ok(junk.score >= 40);
    assert.equal(decideStatus({ moderation: 'post', score: junk.score }), 'pending');

    /* Pre-moderation always waits, whatever the score. */
    assert.equal(decideStatus({ moderation: 'pre', score: 0 }), 'pending');

    const blocked = scoreComment({ body: 'מילה אסורה כאן', blocklist: ['מילה אסורה'] });
    assert.ok(blocked.reasons.includes('blocklisted_word'));
});
