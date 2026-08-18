/* Test harness: a real server on an ephemeral port, backed by a throwaway
   database file, so every test exercises the same code path production does. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { resetRateLimits } from '../server/ratelimit.js';

export const ADMIN_PASSWORD = 'test-password-123';

export function baseConfig(overrides = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engage-test-'));
    return {
        port: 0,
        host: '127.0.0.1',
        dbPath: path.join(dir, 'test.db'),
        publicDir: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public'),
        adminPassword: ADMIN_PASSWORD,
        sessionTtlHours: 1,
        secureCookies: false,
        /* No DNS in tests: the email rules under test are the syntax and
           disposable-domain ones, and a lookup would make them flaky. */
        emailDnsCheck: false,
        blockDisposableEmail: true,
        emailDnsTimeoutMs: 1000,
        trustProxy: false,
        maxCommentLength: 2000,
        maxNameLength: 60,
        bodyLimitBytes: 32 * 1024,
        rateLimits: {
            read: { limit: 1000, windowMs: 60_000 },
            write: { limit: 1000, windowMs: 60_000 },
            register: { limit: 1000, windowMs: 60_000 },
            login: { limit: 1000, windowMs: 60_000 },
        },
        commentCooldownMs: 0,
        commentsPerHour: 100,
        ...overrides,
        _dir: dir,
    };
}

export async function startServer(overrides = {}) {
    resetRateLimits();
    const config = baseConfig(overrides);
    const app = createApp(config);
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;

    const client = {
        base,
        cookie: '',
        async call(path, { method = 'GET', body, headers = {}, token, origin } = {}) {
            const requestHeaders = { 'content-type': 'application/json', ...headers };
            if (token) requestHeaders.authorization = `Bearer ${token}`;
            if (origin) requestHeaders.origin = origin;
            if (client.cookie) requestHeaders.cookie = client.cookie;
            const response = await fetch(base + path, {
                method,
                headers: requestHeaders,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            const setCookie = response.headers.get('set-cookie');
            if (setCookie) client.cookie = setCookie.split(';')[0];
            const text = await response.text();
            let payload = {};
            try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
            return { status: response.status, body: payload, headers: response.headers };
        },
        admin(path, options = {}) {
            return client.call(`/admin/api${path}`, {
                ...options,
                headers: { 'x-tells-admin': '1', ...(options.headers || {}) },
            });
        },
        async login(password = ADMIN_PASSWORD) {
            return client.admin('/login', { method: 'POST', body: { password } });
        },
    };

    return {
        client,
        app,
        async stop() {
            await app.close();
            fs.rmSync(config._dir, { recursive: true, force: true });
        },
    };
}

/* Most tests need a logged-in owner and one registered site. */
export async function withSite(client, siteOptions = {}) {
    await client.login();
    const created = await client.admin('/sites', {
        method: 'POST',
        body: { name: 'Test site', ...siteOptions },
    });
    return created.body.site;
}

export async function registerEmailVisitor(client, siteKey, email = 'reader@gmail.com', name = 'קורא') {
    const response = await client.call('/api/v1/visitors', {
        method: 'POST',
        body: { site: siteKey, mode: 'email', email, name },
    });
    return response;
}
