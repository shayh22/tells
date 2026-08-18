import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, withSite, registerEmailVisitor, ADMIN_PASSWORD } from './helpers.js';

test('registration accepts a valid address and rejects malformed or disposable ones', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);

    const bad = await client.call('/api/v1/visitors', {
        method: 'POST',
        body: { site: site.key, mode: 'email', email: 'not-an-email' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'email_invalid');

    const disposable = await client.call('/api/v1/visitors', {
        method: 'POST',
        body: { site: site.key, mode: 'email', email: 'someone@mailinator.com' },
    });
    assert.equal(disposable.status, 400);
    assert.equal(disposable.body.error, 'email_disposable');

    const good = await registerEmailVisitor(client, site.key, 'Reader@Example.co.il');
    assert.equal(good.status, 201);
    assert.ok(good.body.token);
    assert.equal(good.body.visitor.email, 'reader@example.co.il');
    assert.equal(good.body.visitor.kind, 'email');
});

test('the same address returns the same visitor with a fresh token', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);

    const first = await registerEmailVisitor(client, site.key, 'repeat@gmail.com');
    const second = await registerEmailVisitor(client, site.key, 'repeat@gmail.com');

    assert.equal(second.status, 200);
    assert.equal(second.body.returning, true);
    assert.equal(second.body.visitor.id, first.body.visitor.id);
    assert.notEqual(second.body.token, first.body.token);
});

test('anonymous registration follows the site setting', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;

    const open = await withSite(client, { name: 'Open', allowAnonymous: true });
    const anon = await client.call('/api/v1/visitors', {
        method: 'POST',
        body: { site: open.key, mode: 'anonymous' },
    });
    assert.equal(anon.status, 201);
    assert.equal(anon.body.visitor.kind, 'anonymous');
    assert.equal(anon.body.visitor.email, null);

    const strict = await withSite(client, { name: 'Email only', allowAnonymous: false });
    const denied = await client.call('/api/v1/visitors', {
        method: 'POST',
        body: { site: strict.key, mode: 'anonymous' },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'anonymous_not_allowed');
});

test('a comment on a pre-moderated site waits for approval before it is public', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'pre' });
    const visitor = await registerEmailVisitor(client, site.key);
    const token = visitor.body.token;

    const created = await client.call('/api/v1/comments', {
        method: 'POST',
        token,
        body: { site: site.key, page: '/story-1.html', body: 'תגובה ראשונה', pageTitle: 'סיפור 1' },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'pending');

    /* An anonymous reader sees nothing yet. */
    const anonView = await client.call(`/api/v1/comments?site=${site.key}&page=/story-1.html`);
    assert.equal(anonView.body.comments.length, 0);

    /* The author sees their own comment marked as waiting. */
    const authorView = await client.call(`/api/v1/comments?site=${site.key}&page=/story-1.html`, { token });
    assert.equal(authorView.body.pending.length, 1);

    const id = created.body.comment.id;
    const approved = await client.admin(`/comments/${id}/status`, { method: 'POST', body: { status: 'approved' } });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.comment.status, 'approved');

    const publicView = await client.call(`/api/v1/comments?site=${site.key}&page=/story-1.html`);
    assert.equal(publicView.body.comments.length, 1);
    assert.equal(publicView.body.comments[0].body, 'תגובה ראשונה');
    /* The address stays private even after publication. */
    assert.equal(publicView.body.comments[0].email, undefined);
});

test('a post-moderated site publishes immediately but still holds spam', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const clean = await client.call('/api/v1/comments', {
        method: 'POST',
        token,
        body: { site: site.key, page: '/p', body: 'תגובה עניינית לגמרי' },
    });
    assert.equal(clean.body.status, 'approved');

    const spam = await client.call('/api/v1/comments', {
        method: 'POST',
        token,
        body: { site: site.key, page: '/p', body: 'buy viagra now http://spam.example http://spam2.example' },
    });
    assert.equal(spam.body.status, 'pending');
});

test('deleting a comment removes it from the public thread', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const created = await client.call('/api/v1/comments', {
        method: 'POST',
        token,
        body: { site: site.key, page: '/p', body: 'תגובה שתימחק' },
    });
    const id = created.body.comment.id;

    const removed = await client.admin(`/comments/${id}`, { method: 'DELETE' });
    assert.equal(removed.status, 200);

    const view = await client.call(`/api/v1/comments?site=${site.key}&page=/p`);
    assert.equal(view.body.comments.length, 0);
});

test('duplicate submissions and hourly caps are refused', async (t) => {
    const server = await startServer({ commentsPerHour: 2 });
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const post = (body) => client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body },
    });

    assert.equal((await post('הודעה א')).status, 201);
    const duplicate = await post('הודעה א');
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'duplicate');

    assert.equal((await post('הודעה ב')).status, 201);
    const capped = await post('הודעה ג');
    assert.equal(capped.status, 429);
    assert.equal(capped.body.error, 'hourly_limit');
});

test('an unregistered visitor cannot comment, and the honeypot is refused', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);

    const anonymous = await client.call('/api/v1/comments', {
        method: 'POST',
        body: { site: site.key, page: '/p', body: 'ללא זהות' },
    });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error, 'identity_required');

    const token = (await registerEmailVisitor(client, site.key)).body.token;
    const bot = await client.call('/api/v1/comments', {
        method: 'POST',
        token,
        body: { site: site.key, page: '/p', body: 'ספאם', hp: 'http://bot.example' },
    });
    assert.equal(bot.status, 400);
});

test('likes toggle per visitor and count per page', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);
    const first = (await registerEmailVisitor(client, site.key, 'a@gmail.com')).body.token;
    const second = (await registerEmailVisitor(client, site.key, 'b@gmail.com')).body.token;

    const like = (token) => client.call('/api/v1/likes', {
        method: 'POST', token, body: { site: site.key, page: '/story-2.html' },
    });

    let response = await like(first);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.liked, true);

    response = await like(second);
    assert.equal(response.body.count, 2);

    response = await like(first);
    assert.equal(response.body.liked, false);
    assert.equal(response.body.count, 1);

    const view = await client.call(`/api/v1/likes?site=${site.key}&page=/story-2.html`, { token: second });
    assert.equal(view.body.count, 1);
    assert.equal(view.body.liked, true);
});

test('page identity ignores query strings and trailing slashes', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    await client.call('/api/v1/likes', {
        method: 'POST', token, body: { site: site.key, page: '/blog/post/' },
    });
    const view = await client.call(`/api/v1/likes?site=${site.key}&page=/blog/post?utm_source=x`);
    assert.equal(view.body.count, 1);
});

test('blocking a visitor hides their approved comments and stops new ones', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const registration = await registerEmailVisitor(client, site.key, 'noisy@gmail.com');
    const token = registration.body.token;
    const visitorId = registration.body.visitor.id;

    await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'לפני החסימה' },
    });
    assert.equal((await client.call(`/api/v1/comments?site=${site.key}&page=/p`)).body.comments.length, 1);

    await client.admin(`/visitors/${visitorId}/block`, { method: 'POST', body: { blocked: true } });

    assert.equal((await client.call(`/api/v1/comments?site=${site.key}&page=/p`)).body.comments.length, 0);
    const blocked = await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'אחרי החסימה' },
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, 'visitor_blocked');
});

test('registered origins are enforced and echoed back as CORS headers', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { origins: ['https://allowed.example'] });

    const allowed = await client.call(`/api/v1/comments?site=${site.key}&page=/p`, {
        origin: 'https://allowed.example',
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');

    const denied = await client.call(`/api/v1/comments?site=${site.key}&page=/p`, {
        origin: 'https://evil.example',
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error, 'origin_not_allowed');
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('an unknown site key is rejected', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const response = await server.client.call('/api/v1/comments?site=st_nope&page=/p');
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'site_not_found');
});

test('rotating a site key invalidates the old one', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);

    const rotated = await client.admin(`/sites/${site.id}/rotate-key`, { method: 'POST' });
    assert.notEqual(rotated.body.site.key, site.key);

    const stale = await client.call(`/api/v1/comments?site=${site.key}&page=/p`);
    assert.equal(stale.status, 404);
    const fresh = await client.call(`/api/v1/comments?site=${rotated.body.site.key}&page=/p`);
    assert.equal(fresh.status, 200);
});

test('the dashboard API needs a session and the anti-CSRF header', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;

    const unauthenticated = await client.admin('/overview');
    assert.equal(unauthenticated.status, 401);

    const wrongPassword = await client.admin('/login', { method: 'POST', body: { password: 'nope' } });
    assert.equal(wrongPassword.status, 401);

    await client.login(ADMIN_PASSWORD);
    assert.equal((await client.admin('/overview')).status, 200);

    /* Same cookie, no custom header: a cross-site form post cannot proceed. */
    const noHeader = await client.call('/admin/api/sites', { method: 'POST', body: { name: 'x' } });
    assert.equal(noHeader.status, 403);
    assert.equal(noHeader.body.error, 'csrf');
});

test('the overview aggregates every site the owner runs', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const blog = await withSite(client, { name: 'Blog', moderation: 'post' });
    const shop = await withSite(client, { name: 'Shop', moderation: 'pre' });

    const blogToken = (await registerEmailVisitor(client, blog.key, 'one@gmail.com')).body.token;
    const shopToken = (await registerEmailVisitor(client, shop.key, 'two@gmail.com')).body.token;

    await client.call('/api/v1/comments', {
        method: 'POST', token: blogToken, body: { site: blog.key, page: '/a', body: 'תגובה בבלוג' },
    });
    await client.call('/api/v1/comments', {
        method: 'POST', token: shopToken, body: { site: shop.key, page: '/b', body: 'תגובה בחנות' },
    });
    await client.call('/api/v1/likes', {
        method: 'POST', token: blogToken, body: { site: blog.key, page: '/a' },
    });

    const overview = await client.admin('/overview');
    assert.equal(overview.body.totals.sites, 2);
    assert.equal(overview.body.totals.comments, 2);
    assert.equal(overview.body.totals.pending, 1);
    assert.equal(overview.body.totals.approved, 1);
    assert.equal(overview.body.totals.likes, 1);
    assert.equal(overview.body.perSite.length, 2);

    const all = await client.admin('/comments?status=all');
    assert.equal(all.body.comments.length, 2);
    const names = all.body.comments.map((comment) => comment.siteName).sort();
    assert.deepEqual(names, ['Blog', 'Shop']);
});

test('bulk moderation applies to every selected comment', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client);
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const ids = [];
    for (const text of ['אחת', 'שתיים', 'שלוש']) {
        const created = await client.call('/api/v1/comments', {
            method: 'POST', token, body: { site: site.key, page: '/p', body: text },
        });
        ids.push(created.body.comment.id);
    }

    const bulk = await client.admin('/comments/bulk', { method: 'POST', body: { ids, action: 'approve' } });
    assert.equal(bulk.body.affected, 3);
    assert.equal((await client.call(`/api/v1/comments?site=${site.key}&page=/p`)).body.comments.length, 3);
});

test('replies attach to the comment they answer', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const root = await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'שאלה' },
    });
    const reply = await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'תשובה', parentId: root.body.comment.id },
    });
    assert.equal(reply.body.comment.parentId, root.body.comment.id);

    /* A reply to a reply flattens back to the root, so threads stay readable. */
    const nested = await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'עוד תשובה', parentId: reply.body.comment.id },
    });
    assert.equal(nested.body.comment.parentId, root.body.comment.id);
});

test('comments can be closed per site', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { commentsOn: false, likesOn: false });
    const token = (await registerEmailVisitor(client, site.key)).body.token;

    const comment = await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'לא אמור לעבור' },
    });
    assert.equal(comment.status, 403);
    assert.equal(comment.body.error, 'comments_disabled');

    const like = await client.call('/api/v1/likes', {
        method: 'POST', token, body: { site: site.key, page: '/p' },
    });
    assert.equal(like.status, 403);
    assert.equal(like.body.error, 'likes_disabled');
});

test('the embed script and dashboard are served', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { base } = server.client;

    const embed = await fetch(`${base}/embed.js`);
    assert.equal(embed.status, 200);
    assert.match(embed.headers.get('content-type'), /javascript/);
    assert.equal(embed.headers.get('access-control-allow-origin'), '*');

    const dashboard = await fetch(`${base}/admin`);
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /ניהול תגובות ולייקים/);

    /* The dashboard page loads its stylesheet and script by relative path, so
       both must resolve under /admin/ — not at the site root. */
    for (const asset of ['dashboard.css', 'dashboard.js']) {
        const response = await fetch(`${base}/admin/${asset}`);
        assert.equal(response.status, 200, asset);
    }

    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);

    /* Path traversal must not escape the public directory. */
    const escape = await fetch(`${base}/../server/config.js`);
    assert.ok(escape.status === 404 || escape.status === 403);
});

test('CSV export includes the moderated comments', async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const { client } = server;
    const site = await withSite(client, { moderation: 'post' });
    const token = (await registerEmailVisitor(client, site.key)).body.token;
    await client.call('/api/v1/comments', {
        method: 'POST', token, body: { site: site.key, page: '/p', body: 'שורה לייצוא' },
    });

    const response = await fetch(`${client.base}/admin/api/comments/export`, {
        headers: { cookie: client.cookie, 'x-tells-admin': '1' },
    });
    assert.equal(response.status, 200);
    const csv = await response.text();
    assert.match(csv, /שורה לייצוא/);
});
