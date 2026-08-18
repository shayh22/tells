# tells 

A project for sharing and discovering stories.

## 📖 About

**tells** is a platform designed to help people share their stories and experiences with others in a meaningful way.

## 🚀 Getting Started

To get started with tells, clone this repository and follow the setup instructions.

```bash
git clone https://github.com/shayh22/tells.git
cd tells
```

## 💬 ניהול תגובות ולייקים (`app/`)

תיקיית [`app/`](app/) מכילה אפליקציה עצמאית לניהול תגובות ולייקים של מבקרים בכל האתרים שלי:
שרת Node ללא תלויות, דשבורד ניהול בעברית (אישור, דחייה ומחיקה של תגובות), ורכיבי הטמעה
שמתווספים לכל דף בשורה אחת. פרטים מלאים ב־[`app/README.md`](app/README.md).

אפשר להריץ אותה על Cloudflare Workers + D1 בתוכנית החינמית, או כשרת Node מקומי:

```bash
cd app/worker && npm install && npm run deploy   # Cloudflare (ראו worker/README.md)
cd app && npm start                              # מקומי: http://localhost:4000/admin/
```

## 📚 Documentation

For more information, visit our [GitHub Pages](https://shayh22.github.io/tells/).

## 📝 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues and pull requests.

---

**Built with ❤️ by shayh22**
