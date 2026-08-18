/* Small maintenance CLI for the cases a browser cannot cover: a forgotten
   dashboard password, or provisioning a site from a deploy script.

   Usage:
     node server/cli.js reset-password [newPassword]
     node server/cli.js create-site "My blog" https://example.com
     node server/cli.js list-sites
*/
import config from './config.js';
import { openDatabase, logAudit } from './db.js';
import { setAdminPassword } from './auth.js';
import { newSiteKey, randomToken } from './util/crypto.js';
import { normalizeOrigin } from './util/validation.js';

const [command, ...args] = process.argv.slice(2);
const db = openDatabase(config.dbPath);

function resetPassword() {
    const password = args[0] || randomToken(12);
    setAdminPassword(db, password);
    db.prepare('DELETE FROM admin_sessions').run();
    logAudit(db, 'admin.password_reset', 'session', null, { via: 'cli' });
    console.log('הסיסמה עודכנה. הסיסמה החדשה:');
    console.log(`  ${password}`);
}

function createSite() {
    const name = args[0];
    if (!name) {
        console.error('שימוש: node server/cli.js create-site "שם האתר" [origin ...]');
        process.exitCode = 1;
        return;
    }
    const origins = args.slice(1).map(normalizeOrigin).filter(Boolean);
    const key = newSiteKey();
    db.prepare(`INSERT INTO sites (key, name, origins, moderation, allow_anonymous, comments_on, likes_on, locale, active, created_at)
                VALUES (?, ?, ?, 'pre', 1, 1, 1, 'he', 1, ?)`)
        .run(key, name, JSON.stringify(origins), new Date().toISOString());
    console.log(`האתר "${name}" נוצר. מפתח האתר:`);
    console.log(`  ${key}`);
}

function listSites() {
    const rows = db.prepare('SELECT key, name, origins, moderation, active FROM sites ORDER BY name').all();
    if (!rows.length) {
        console.log('אין אתרים רשומים עדיין.');
        return;
    }
    for (const row of rows) {
        console.log(`${row.key}  ${row.name}  [${row.moderation}]  ${row.active ? '' : '(כבוי) '}${row.origins}`);
    }
}

switch (command) {
    case 'reset-password': resetPassword(); break;
    case 'create-site': createSite(); break;
    case 'list-sites': listSites(); break;
    default:
        console.log('פקודות: reset-password | create-site | list-sites');
        process.exitCode = 1;
}

db.close();
