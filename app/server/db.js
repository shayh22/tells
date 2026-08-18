/* SQLite storage. Uses node:sqlite (built into Node 22+) so the whole server
   ships with zero dependencies and the database is a single portable file. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomToken } from './util/crypto.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    key             TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    origins         TEXT NOT NULL DEFAULT '[]',   -- JSON array of allowed origins
    moderation      TEXT NOT NULL DEFAULT 'pre',  -- 'pre' | 'post'
    allow_anonymous INTEGER NOT NULL DEFAULT 1,
    comments_on     INTEGER NOT NULL DEFAULT 1,
    likes_on        INTEGER NOT NULL DEFAULT 1,
    locale          TEXT NOT NULL DEFAULT 'he',
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,                  -- 'email' | 'anonymous'
    email        TEXT,
    email_domain TEXT,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    ip_hash      TEXT,
    blocked      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS visitors_site_email ON visitors(site_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS visitors_site ON visitors(site_id);

CREATE TABLE IF NOT EXISTS comments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id   INTEGER REFERENCES visitors(id) ON DELETE SET NULL,
    parent_id    INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    page_path    TEXT NOT NULL,
    page_url     TEXT,
    page_title   TEXT,
    author_name  TEXT NOT NULL,
    author_email TEXT,
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    body         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    spam_score   INTEGER NOT NULL DEFAULT 0,
    spam_reasons TEXT NOT NULL DEFAULT '[]',
    ip_hash      TEXT,
    user_agent   TEXT,
    created_at   TEXT NOT NULL,
    moderated_at TEXT
);
CREATE INDEX IF NOT EXISTS comments_site_page ON comments(site_id, page_path, status);
CREATE INDEX IF NOT EXISTS comments_status ON comments(status, created_at);
CREATE INDEX IF NOT EXISTS comments_visitor ON comments(visitor_id);

CREATE TABLE IF NOT EXISTS likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    visitor_id INTEGER NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
    page_path  TEXT NOT NULL,
    page_url   TEXT,
    page_title TEXT,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS likes_unique ON likes(site_id, page_path, visitor_id);
CREATE INDEX IF NOT EXISTS likes_site_page ON likes(site_id, page_path);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip_hash    TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  INTEGER,
    details    TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_log(created_at);
`;

export function openDatabase(dbPath) {
    if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec(SCHEMA);
    return db;
}

export function getSetting(db, key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

export function setSetting(db, key, value) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

/* A per-install salt keeps stored IP hashes from being reversible with a
   rainbow table, and keeps them incomparable across installs. */
export function getOrCreateSetting(db, key, factory) {
    const existing = getSetting(db, key);
    if (existing) return existing;
    const value = factory();
    setSetting(db, key, value);
    return value;
}

export function ensureIpSalt(db) {
    return getOrCreateSetting(db, 'ip_salt', () => randomToken(16));
}

export function logAudit(db, action, entity, entityId, details) {
    db.prepare(`INSERT INTO audit_log (action, entity, entity_id, details, created_at)
                VALUES (?, ?, ?, ?, ?)`)
        .run(action, entity, entityId ?? null, details ? JSON.stringify(details) : null, new Date().toISOString());
}
