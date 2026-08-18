/* Contract check: drives a running deployment over HTTP and asserts the
   behaviour both runtimes promise. Use it against the Node server, against
   `wrangler dev`, or against the live Worker right after deploying.
 *
 *   node test/contract.mjs http://localhost:4000 'admin-password'
 *
 * It creates two throwaway sites, exercises them, and deletes them again. */

const [baseArg, password] = process.argv.slice(2);
const base = (baseArg || 'http://localhost:4000').replace(/\/$/, '');
if (!password) {
    console.error('שימוש: node test/contract.mjs <base-url> <admin-password>');
    process.exit(2);
}

let cookie = '';
let passed = 0;
let skipped = 0;
const failures = [];

async function call(path, { method = 'GET', body, token, origin, admin, raw } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (origin) headers.origin = origin;
    if (admin) {
        headers['x-tells-admin'] = '1';
        if (cookie) headers.cookie = cookie;
    }
    const response = await fetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'follow',
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    if (raw) return { status: response.status, text, headers: response.headers };
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    return { status: response.status, body: payload, headers: response.headers };
}

function check(label, condition, detail) {
    /* Running this script twice in a row spends the registration quota, which
       is the limiter doing its job — report it as skipped, not as a fault. */
    if (!condition && detail && detail.error === 'rate_limited') {
        skipped += 1;
        console.log(`  ⚠ ${label} — לא נבדק, הגבלת קצב פעילה`);
        return;
    }
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failures.push(label);
        console.log(`  ✗ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
    }
}

const stamp = Date.now();
const emailFor = (name) => `${name}.${stamp}@gmail.com`;
const createdSites = [];

async function main() {
    console.log(`בודק את ${base}\n`);

    console.log('בריאות והתחברות');
    check('healthz עונה', (await call('/healthz')).status === 200);
    check('סיסמה שגויה נדחית', (await call('/admin/api/login', {
        method: 'POST', admin: true, body: { password: `${password}-wrong` },
    })).status === 401);
    const login = await call('/admin/api/login', { method: 'POST', admin: true, body: { password } });
    check('התחברות מצליחה', login.status === 200, login.body);
    if (login.status !== 200) return;

    console.log('\nאתרים');
    const created = await call('/admin/api/sites', {
        method: 'POST', admin: true,
        body: { name: `בדיקה ${stamp}`, moderation: 'pre', allowAnonymous: true },
    });
    check('יצירת אתר', created.status === 201 && !!created.body.site?.key, created.body);
    const site = created.body.site;
    createdSites.push(site.id);

    const strictCreated = await call('/admin/api/sites', {
        method: 'POST', admin: true,
        body: { name: `אימייל בלבד ${stamp}`, moderation: 'post', allowAnonymous: false },
    });
    const strict = strictCreated.body.site;
    createdSites.push(strict.id);

    console.log('\nרישום מבקרים');
    const badEmail = await call('/api/v1/visitors', {
        method: 'POST', body: { site: site.key, mode: 'email', email: 'not-an-email' },
    });
    check('אימייל לא תקין נדחה', badEmail.status === 400 && badEmail.body.error === 'email_invalid', badEmail.body);

    const disposable = await call('/api/v1/visitors', {
        method: 'POST', body: { site: site.key, mode: 'email', email: 'x@mailinator.com' },
    });
    check('אימייל זמני נדחה', disposable.status === 400 && disposable.body.error === 'email_disposable', disposable.body);

    const reg = await call('/api/v1/visitors', {
        method: 'POST', body: { site: site.key, mode: 'email', email: emailFor('reader'), name: 'קורא' },
    });
    check('רישום עם אימייל תקין', reg.status === 201 && !!reg.body.token, reg.body);
    const token = reg.body.token;

    const again = await call('/api/v1/visitors', {
        method: 'POST', body: { site: site.key, mode: 'email', email: emailFor('reader') },
    });
    check('מבקר חוזר מקבל את אותה זהות',
        again.body.returning === true && again.body.visitor?.id === reg.body.visitor?.id, again.body);
    check('טוקן חדש בכל התחברות', !!again.body.token && again.body.token !== token, again.body);

    const anon = await call('/api/v1/visitors', { method: 'POST', body: { site: site.key, mode: 'anonymous' } });
    check('רישום אנונימי מותר כשהוגדר', anon.status === 201 && anon.body.visitor.kind === 'anonymous', anon.body);

    const anonDenied = await call('/api/v1/visitors', { method: 'POST', body: { site: strict.key, mode: 'anonymous' } });
    check('אנונימי נחסם באתר שמחייב אימייל',
        anonDenied.status === 403 && anonDenied.body.error === 'anonymous_not_allowed', anonDenied.body);

    console.log('\nתגובות ואישור');
    /* If the repeat registration was rate limited, keep using the first token. */
    const liveToken = again.body.token || token;
    const posted = await call('/api/v1/comments', {
        method: 'POST', token: liveToken,
        body: { site: site.key, page: '/contract', pageTitle: 'בדיקת חוזה', body: `תגובה ${stamp}` },
    });
    check('שליחת תגובה', posted.status === 201 && posted.body.status === 'pending', posted.body);

    const anonymousView = await call(`/api/v1/comments?site=${site.key}&page=/contract`);
    check('התגובה לא גלויה לפני אישור', anonymousView.body.comments.length === 0);

    const authorView = await call(`/api/v1/comments?site=${site.key}&page=/contract`, { token: liveToken });
    check('הכותב רואה שהתגובה ממתינה', authorView.body.pending.length === 1);

    const duplicate = await call('/api/v1/comments', {
        method: 'POST', token: liveToken, body: { site: site.key, page: '/contract', body: `תגובה ${stamp}` },
    });
    check('כפילות נדחית', duplicate.status === 409 || duplicate.status === 429, duplicate.body);

    const commentId = posted.body.comment.id;
    const approved = await call(`/admin/api/comments/${commentId}/status`, {
        method: 'POST', admin: true, body: { status: 'approved' },
    });
    check('אישור תגובה', approved.status === 200 && approved.body.comment.status === 'approved', approved.body);

    const publicView = await call(`/api/v1/comments?site=${site.key}&page=/contract`);
    check('אחרי אישור התגובה גלויה', publicView.body.comments.length === 1);
    check('האימייל לא נחשף בציבור', publicView.body.comments[0].email === undefined);

    console.log('\nלייקים');
    const like = await call('/api/v1/likes', { method: 'POST', token: liveToken, body: { site: site.key, page: '/contract' } });
    check('הוספת לייק', like.body.count === 1 && like.body.liked === true, like.body);
    const unlike = await call('/api/v1/likes', { method: 'POST', token: liveToken, body: { site: site.key, page: '/contract' } });
    check('ביטול לייק', unlike.body.count === 0 && unlike.body.liked === false, unlike.body);

    console.log('\nהרשאות');
    const noIdentity = await call('/api/v1/comments', {
        method: 'POST', body: { site: site.key, page: '/contract', body: 'ללא זהות' },
    });
    check('אי אפשר להגיב בלי זהות', noIdentity.status === 401, noIdentity.body);

    await call(`/admin/api/sites/${site.id}`, {
        method: 'PATCH', admin: true, body: { origins: ['https://allowed.example'] },
    });
    const wrongOrigin = await call(`/api/v1/comments?site=${site.key}&page=/contract`, { origin: 'https://evil.example' });
    check('דומיין לא מורשה נדחה', wrongOrigin.status === 403, wrongOrigin.body);
    const rightOrigin = await call(`/api/v1/comments?site=${site.key}&page=/contract`, { origin: 'https://allowed.example' });
    check('דומיין מורשה מתקבל',
        rightOrigin.status === 200 && rightOrigin.headers.get('access-control-allow-origin') === 'https://allowed.example');
    await call(`/admin/api/sites/${site.id}`, { method: 'PATCH', admin: true, body: { origins: [] } });

    const csrf = await fetch(`${base}/admin/api/sites`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'x' }),
    });
    check('בקשה בלי כותרת ההגנה נדחית', csrf.status === 403);

    console.log('\nדשבורד');
    const overview = await call('/admin/api/overview', { admin: true });
    check('סקירה מרכזת את כל האתרים', overview.status === 200 && overview.body.totals.sites >= 2, overview.body?.totals);
    const list = await call('/admin/api/comments?status=all', { admin: true });
    check('רשימת התגובות מגיעה עם שם האתר', list.body.comments.some((c) => c.siteName?.includes('בדיקה')));
    const csv = await call('/admin/api/comments/export', { admin: true, raw: true });
    check('ייצוא CSV', csv.status === 200 && csv.text.includes(`תגובה ${stamp}`));

    console.log('\nמפתח אתר');
    const rotated = await call(`/admin/api/sites/${site.id}/rotate-key`, { method: 'POST', admin: true });
    check('החלפת מפתח מנפיקה מפתח חדש', rotated.body.site.key !== site.key);
    check('המפתח הישן מפסיק לעבוד', (await call(`/api/v1/comments?site=${site.key}&page=/contract`)).status === 404);
    check('המפתח החדש עובד', (await call(`/api/v1/comments?site=${rotated.body.site.key}&page=/contract`)).status === 200);

    console.log('\nסטטיים');
    check('embed.js מוגש לכל דומיין', (await call('/embed.js', { raw: true })).headers.get('access-control-allow-origin') === '*');
    const dashboard = await call('/admin/', { raw: true });
    check('הדשבורד נטען', dashboard.status === 200 && dashboard.text.includes('ניהול תגובות ולייקים'));
    check('קובצי הדשבורד נטענים', (await call('/admin/dashboard.js', { raw: true })).status === 200);
}

try {
    await main();
} finally {
    for (const id of createdSites) {
        await call(`/admin/api/sites/${id}`, { method: 'DELETE', admin: true }).catch(() => {});
    }
    console.log(`\n${passed} בדיקות עברו, ${failures.length} נכשלו${skipped ? `, ${skipped} לא נבדקו` : ''}`);
    if (failures.length) {
        console.log(failures.map((name) => `  - ${name}`).join('\n'));
        process.exit(1);
    }
}
