# הפעלה על Cloudflare (חינם)

אותה אפליקציה בדיוק — אותו דשבורד, אותם רכיבי הטמעה, אותו API — רצה כ־Cloudflare Worker
עם מסד נתונים D1. הכול נכנס לתוכנית החינמית של Cloudflare, ואין שרת לתחזק.

| מה | איפה זה רץ |
| --- | --- |
| ה־API והדשבורד | Cloudflare Workers |
| הנתונים | D1 (SQLite מנוהל) |
| `embed.js`, הדשבורד, דף ההדגמה | Workers Static Assets |

---

## פריסה בשבעה צעדים

```bash
cd app/worker
npm install

# 1. חיבור לחשבון Cloudflare (נפתח דפדפן)
npx wrangler login

# 2. יצירת מסד הנתונים
npx wrangler d1 create tells-engage
```

הפקודה מדפיסה `database_id`. העתיקו אותו אל `wrangler.toml`, במקום `REPLACE_WITH_YOUR_DATABASE_ID`.

```bash
# 3. יצירת הטבלאות בענן
npm run db:init

# 4. קביעת סיסמת הדשבורד (נשמרת כסוד, לא בקוד)
npx wrangler secret put ADMIN_PASSWORD

# 5. פריסה
npm run deploy
```

בסוף הפריסה מודפסת הכתובת, למשל `https://tells-engage.<שם-החשבון>.workers.dev`.

```bash
# 6. בדיקה שהכול עובד מקצה לקצה מול הכתובת האמיתית
node ../test/contract.mjs https://tells-engage.<שם-החשבון>.workers.dev 'הסיסמה שלכם'
```

7. היכנסו ל־`https://.../admin/`, הוסיפו אתר, והעתיקו את קוד ההטמעה. הוא כבר יצביע לכתובת
   הנכונה:

```html
<script src="https://tells-engage.<שם-החשבון>.workers.dev/embed.js" data-site="st_xxxx" defer></script>
<div data-tells="likes"></div>
<div data-tells="comments"></div>
```

בכרטיס האתר בדשבורד כדאי למלא את הדומיינים המורשים (למשל `https://shayh22.github.io`) — כך
רק האתרים שלכם יוכלו לכתוב לשרת.

---

## פיתוח מקומי

```bash
cd app/worker
npm install
npm run db:init:local                       # טבלאות במסד מקומי
printf 'ADMIN_PASSWORD=local-dev-pass\n' > .dev.vars
npm run dev                                 # http://127.0.0.1:8787
```

`.dev.vars` לא נכנס ל־git. אפשר להוסיף בו גם משתני הגדרה, למשל `RATE_REGISTER=500`, כדי
שהגבלות הקצב לא יפריעו בזמן פיתוח.

---

## הגדרות

ב־`wrangler.toml`, תחת `[vars]`:

| משתנה | ברירת מחדל | תיאור |
| --- | --- | --- |
| `EMAIL_DNS_CHECK` | `true` | בדיקה שלדומיין של האימייל יש שרת דואר, דרך DNS-over-HTTPS |
| `BLOCK_DISPOSABLE_EMAIL` | `true` | חסימת ספקי אימייל זמניים |
| `MAX_COMMENT_LENGTH` | `2000` | אורך תגובה מרבי |
| `COMMENT_COOLDOWN_MS` | `20000` | השהיה בין שתי תגובות של אותו מבקר |
| `COMMENTS_PER_HOUR` | `12` | מכסת תגובות לשעה לכל מבקר |
| `SESSION_TTL_HOURS` | `12` | תוקף חיבור לדשבורד |
| `RATE_WRITE` / `RATE_REGISTER` / `RATE_LOGIN` | `20` / `10` / `10` | הגבלות קצב לפי כתובת IP |

הסיסמה היא היחידה שנשמרת כ־secret: `npx wrangler secret put ADMIN_PASSWORD`.
בפעם הראשונה שמתחברים איתה, נגזר ממנה hash שנשמר בבסיס הנתונים — מאותו רגע אפשר לשנות
סיסמה גם מתוך הדשבורד.

---

## מה שונה מגרסת ה־Node

שתי הגרסאות חולקות את אותה לוגיקה טהורה (`app/shared/`) ואת אותם קבצים סטטיים
(`app/public/`), ועוברות את אותה בדיקת חוזה. ההבדלים הם רק במה שהריצה מכתיבה:

| | Node | Cloudflare |
| --- | --- | --- |
| בסיס נתונים | קובץ SQLite מקומי (`node:sqlite`) | D1 |
| בדיקת דומיין האימייל | `node:dns` | DNS-over-HTTPS |
| סיסמת ניהול | scrypt | PBKDF2‑SHA256 (מה ש‑WebCrypto מציע) |
| הגבלת קצב | מונה בזיכרון התהליך | טבלה ב־D1, כי Worker לא זוכר בין בקשות |
| כתובת המבקר | `X-Forwarded-For` (אם הוגדר proxy) | `CF-Connecting-IP` |
| עוגיית הדשבורד | `Secure` לפי הגדרה | תמיד `Secure` |

בדיקת ה־DNS בשתי הגרסאות נכשלת לטובת המבקר: רק תשובה חד־משמעית שהדומיין לא קיים חוסמת
הרשמה, כדי שתקלת DNS לא תנעל אנשים אמיתיים בחוץ.

---

## תפעול שוטף

```bash
npx wrangler tail                              # לוגים חיים
npx wrangler d1 execute tells-engage --remote --command "SELECT COUNT(*) FROM comments"
npx wrangler d1 export tells-engage --remote --output backup.sql   # גיבוי
```

בתוכנית החינמית של D1 יש 5GB אחסון, 5 מיליון שורות קריאה ו־100 אלף שורות כתיבה ביום —
הרבה מעבר לאתר תוכן רגיל. קריאה של תגובות ולייקים לא כותבת כלום; רק הרשמה, תגובה, לייק
ופעולות ניהול כותבות.
