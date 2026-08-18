/* Entry point: boots the app, prints the first-run password, and shuts down
   cleanly so SQLite always closes its WAL. */
import config from './config.js';
import { createApp } from './app.js';

const app = createApp(config);

app.server.listen(config.port, config.host, () => {
    const base = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
    console.log(`[engage] listening on ${base}`);
    console.log(`[engage] dashboard: ${base}/admin`);
    console.log(`[engage] embed script: ${base}/embed.js`);
    if (app.bootstrap.generated) {
        console.log('');
        console.log('  ┌─────────────────────────────────────────────┐');
        console.log('  │  סיסמת הדשבורד שנוצרה בהפעלה הראשונה:        │');
        console.log(`  │  ${app.bootstrap.password.padEnd(41)}│`);
        console.log('  │  שמרו אותה — היא לא תוצג שוב.               │');
        console.log('  └─────────────────────────────────────────────┘');
        console.log('');
    }
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[engage] ${signal} received, shutting down`);
        await app.close();
        process.exit(0);
    });
}
