# -*- coding: utf-8 -*-
"""Generate the whole site: one directory per language, plus the files search
engines and AI crawlers look for.

Hebrew is the original and sits at the root; each translation gets its own
directory, so every language is a separate URL that can be indexed and linked
with hreflang rather than being swapped in by script."""

import datetime, json, os, re, sys, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from langs import LANGS, META, UI, SITE
from seo import SEO
from content_he_1_3 import STORY_1, STORY_2, STORY_3
from content_he_4_7 import STORY_4, STORY_5, STORY_6, STORY_7
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HE = [STORY_1, STORY_2, STORY_3, STORY_4, STORY_5, STORY_6, STORY_7]
N = len(HE)
ASSET_V = {}          # filled in by stamp()
EMAIL = "shayh22@gmail.com"
# the site key the engagement widgets were registered under; without it
# embed.js renders "missing data-site" instead of the likes and comments
ENGAGE_SITE = "st_4z18htIPwyOn"
LOGO = "images/birkat-hanasi-logo.webp"
HERO = "images/mirror-hero.jpg"
# a freshness signal for search; the modified date follows the last build
PUBLISHED = "2026-08-18"
MODIFIED = datetime.date.today().isoformat()


# ---------------------------------------------------------------- translations

def load(lang):
    """Return {story_number: {title, topic, texts, figs}} for a language."""
    if lang == "he":
        out = {}
        for st in HE:
            texts = [v for k, v in st["blocks"] if k in ("p", "h", "moral")]
            figs = []
            for k, v in st["blocks"]:
                if k == "img":
                    figs.append(FIGTEXT_HE[(st["slug"], v)])
            out[st["n"]] = {"title": st["title"], "topic": st["topic"],
                            "texts": texts, "figs": figs}
        return out
    mod_a = __import__("tr_%s_1_3" % lang)
    mod_b = __import__("tr_%s_4_7" % lang)
    d = dict(getattr(mod_a, "%s_1_3" % lang.upper()))
    d.update(getattr(mod_b, "%s_4_7" % lang.upper()))
    return d


def hebrew_figure_text():
    """The Hebrew alt and caption already written for each illustration."""
    out = {}
    for n in range(1, N + 1):
        p = os.path.join(REPO, "story-%d.html" % n)
        if not os.path.exists(p):
            continue
        for m in re.finditer(
                r'<img src="images/([a-z]+)-([a-z0-9-]+)\.jpg" alt="([^"]*)"[^>]*>\s*\n\s*<figcaption>([^<]*)</figcaption>',
                open(p, encoding="utf-8").read()):
            out[(m.group(1), m.group(2))] = (m.group(3), m.group(4))
    return out


FIGTEXT_HE = hebrew_figure_text()


# ---------------------------------------------------------------- helpers

def e(s):
    return html.escape(s, quote=True)


def quote_spans(text):
    return re.sub(r'"([^"]+)"',
                  lambda m: '<span class="dialogue">"%s"</span>' % m.group(1), text)


def url(lang, page):
    return "%s/%s%s" % (SITE, META[lang]["path"], page)


def asset(lang, path):
    up = "../" if META[lang]["path"] else ""
    v = ASSET_V.get(path)
    return up + path + (("?v=" + v) if v else "")


# ---------------------------------------------------------------- SEO blocks

def alternates(page):
    out = ['    <link rel="alternate" hreflang="x-default" href="%s">' % url("he", page)]
    for l in LANGS:
        out.append('    <link rel="alternate" hreflang="%s" href="%s">' % (l, url(l, page)))
    return "\n".join(out)


def jsonld(obj):
    return ('    <script type="application/ld+json">\n%s\n    </script>'
            % json.dumps(obj, ensure_ascii=False, indent=2))


def publisher():
    return {"@type": "Organization", "name": "Birkat HaNasi",
            "url": "https://birkat-hanasi.lovable.app",
            "logo": {"@type": "ImageObject", "url": "%s/%s" % (SITE, LOGO)}}


def index_jsonld(lang, tr):
    u = UI[lang]
    seo = SEO[lang]
    topics = [seo[i + 1]["label"] for i in range(N)]
    site = {"@context": "https://schema.org", "@type": "WebSite",
            "@id": url(lang, "") + "#website",
            "name": u["site"], "alternateName": UI["he"]["site"],
            "description": seo["about"], "url": url(lang, ""),
            "about": topics, "keywords": seo["keywords"],
            "inLanguage": lang, "publisher": publisher()}
    collection = {"@context": "https://schema.org", "@type": "CollectionPage",
                  "name": u["site"], "description": seo["about"],
                  "about": topics, "keywords": seo["keywords"],
                  "url": url(lang, ""), "inLanguage": lang,
                  "datePublished": PUBLISHED, "dateModified": MODIFIED,
                  "isPartOf": {"@id": url(lang, "") + "#website"},
                  "hasPart": [{"@type": "ShortStory", "position": i + 1,
                               "name": tr[i + 1]["title"],
                               "alternativeHeadline": seo[i + 1]["label"],
                               "about": [seo[i + 1]["label"], tr[i + 1]["topic"]],
                               "description": seo[i + 1]["desc"],
                               "url": url(lang, "story-%d.html" % (i + 1)),
                               "inLanguage": lang}
                              for i in range(N)]}
    items = {"@context": "https://schema.org", "@type": "ItemList",
             "name": u["toc"], "numberOfItems": N, "itemListOrder": "https://schema.org/ItemListOrderAscending",
             "itemListElement": [{"@type": "ListItem", "position": i + 1,
                                  "name": tr[i + 1]["title"],
                                  "url": url(lang, "story-%d.html" % (i + 1))}
                                 for i in range(N)]}
    return "\n".join([jsonld(site), jsonld(collection), jsonld(items)])


def story_jsonld(lang, n, tr, first_image, description):
    u = UI[lang]
    seo = SEO[lang][n]
    story = {"@context": "https://schema.org", "@type": "ShortStory",
             "headline": tr[n]["title"], "name": tr[n]["title"],
             "alternativeHeadline": seo["label"],
             "description": description, "about": [seo["label"], tr[n]["topic"]],
             "inLanguage": lang, "url": url(lang, "story-%d.html" % n),
             "mainEntityOfPage": {"@type": "WebPage", "@id": url(lang, "story-%d.html" % n)},
             "isPartOf": {"@type": "CreativeWorkSeries", "name": u["site"], "url": url(lang, "")},
             "position": n, "genre": ["Fable", "Parable"],
             "datePublished": PUBLISHED, "dateModified": MODIFIED,
             "publisher": publisher(), "author": publisher(),
             "keywords": seo["keywords"]}
    if first_image:
        story["image"] = "%s/%s" % (SITE, first_image)
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList",
              "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": u["site"], "item": url(lang, "")},
                  {"@type": "ListItem", "position": 2, "name": tr[n]["title"],
                   "item": url(lang, "story-%d.html" % n)}]}
    return "\n".join([jsonld(story), jsonld(crumbs)])


# ---------------------------------------------------------------- page chrome

def head(lang, page, title, description, image, extra_ld):
    m = META[lang]
    return """<!DOCTYPE html>
<html lang="%s" dir="%s">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <meta name="description" content="%s">
    <meta name="theme-color" content="#312e81">
    <link rel="canonical" href="%s">
%s
    <meta property="og:type" content="%s">
    <meta property="og:site_name" content="%s">
    <meta property="og:locale" content="%s">
%s
    <meta property="og:title" content="%s">
    <meta property="og:description" content="%s">
    <meta property="og:url" content="%s">
    <meta property="og:image" content="%s/%s">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="%s">
    <meta name="twitter:description" content="%s">
    <meta name="twitter:image" content="%s/%s">
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
%s
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700&family=Frank+Ruhl+Libre:wght@500;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="%s">
%s
</head>
<body>
""" % (lang, m["dir"], e(title), e(description), url(lang, page), alternates(page),
       "article" if page.startswith("story") else "website",
       e(UI[lang]["site"]), m["locale"],
       "\n".join('    <meta property="og:locale:alternate" content="%s">' % META[l]["locale"]
                 for l in LANGS if l != lang),
       e(title), e(description), url(lang, page), SITE, image,
       e(title), e(description), SITE, image,
       extra_ld, asset(lang, "assets/styles.css"), NOFLASH)


NOFLASH = """    <script>
        /* Runs before the body paints, so a reader who chose a theme or an
           accessibility setting never sees the default flash first. */
        (function () {
            var root = document.documentElement;
            try {
                var theme = localStorage.getItem('tells.theme');
                if (theme === 'dark' || theme === 'light') {
                    root.setAttribute('data-theme', theme);
                }
            } catch (e) { /* private mode: system preference still applies */ }
            try {
                var a = JSON.parse(localStorage.getItem('tells.a11y') || '{}');
                window.__a11yState = { size: a.size || 100 };
                if (a.size && a.size !== 100) root.style.fontSize = a.size + '%';
                var flags = { contrast: 'a11y-contrast', grayscale: 'a11y-grayscale',
                              underline: 'a11y-underline', readable: 'a11y-readable',
                              motion: 'a11y-no-motion' };
                for (var k in flags) {
                    if (a[k]) { root.classList.add(flags[k]); window.__a11yState[k] = true; }
                }
            } catch (e) { window.__a11yState = { size: 100 }; }
        })();
    </script>"""


# Flags drawn inline so they render identically everywhere: emoji flags fall
# back to bare letter pairs on Windows. CSS crops each 3:2 flag to a circle.
FLAGS = {
 'he': ('<rect width="36" height="24" fill="#fff"/>'
        '<path d="M0 3.6h36v2.4H0zM0 18h36v2.4H0z" fill="#0038b8"/>'
        '<path d="M18 7.4 22.2 14.6H13.8ZM18 16.6 13.8 9.4H22.2Z" fill="none"'
        ' stroke="#0038b8" stroke-width="0.95"/>'),
 'en': ('<rect width="36" height="24" fill="#012169"/>'
        '<path d="M0 0 36 24M36 0 0 24" stroke="#fff" stroke-width="5"/>'
        '<path d="M0 0 36 24M36 0 0 24" stroke="#c8102e" stroke-width="2.2"/>'
        '<path d="M18 0V24M0 12H36" stroke="#fff" stroke-width="8"/>'
        '<path d="M18 0V24M0 12H36" stroke="#c8102e" stroke-width="4.6"/>'),
 'ru': ('<path d="M0 0h36v8H0z" fill="#fff"/>'
        '<path d="M0 8h36v8H0z" fill="#0039a6"/>'
        '<path d="M0 16h36v8H0z" fill="#d52b1e"/>'),
 'es': ('<rect width="36" height="24" fill="#aa151b"/>'
        '<path d="M0 6h36v12H0z" fill="#f1bf00"/>'),
 'zh': ('<rect width="36" height="24" fill="#ee1c25"/>'
        '<path d="M12.00 5.00L12.90 7.76L15.80 7.76L13.45 9.47L14.35 12.24L12.00 10.53L9.65 12.24L10.55 9.47L8.20 7.76L11.10 7.76ZM18.60 3.25L18.93 4.25L19.98 4.25L19.13 4.87L19.45 5.87L18.60 5.25L17.75 5.87L18.07 4.87L17.22 4.25L18.27 4.25ZM21.20 5.85L21.53 6.85L22.58 6.85L21.73 7.47L22.05 8.47L21.20 7.85L20.35 8.47L20.67 7.47L19.82 6.85L20.87 6.85ZM21.20 9.45L21.53 10.45L22.58 10.45L21.73 11.07L22.05 12.07L21.20 11.45L20.35 12.07L20.67 11.07L19.82 10.45L20.87 10.45ZM18.60 12.05L18.93 13.05L19.98 13.05L19.13 13.67L19.45 14.67L18.60 14.05L17.75 14.67L18.07 13.67L17.22 13.05L18.27 13.05Z" fill="#ffde00"/>'),
}


def lang_flags(lang, page):
    """A row of real <a hreflang> links, one flag each, always visible: the
    switcher stays crawlable and needs no JavaScript to open."""
    items = []
    for l in LANGS:
        cur = ' aria-current="true"' if l == lang else ""
        href = (("../" if META[lang]["path"] else "")
                + META[l]["path"] + page) or "./"
        items.append(
            '                <a lang="%s" hreflang="%s" href="%s"%s title="%s"'
            ' aria-label="%s">\n'
            '                    <svg viewBox="0 0 36 24" aria-hidden="true"'
            ' focusable="false" preserveAspectRatio="xMidYMid slice">%s</svg>\n'
            '                </a>' % (l, l, href, cur, e(META[l]["native"]),
                                      e(META[l]["native"]), FLAGS[l]))
    return """        <nav class="lang-flags" aria-label="%s">
%s
        </nav>""" % (e(UI[lang]["lang_aria"]), "\n".join(items))


def header_tools(lang):
    u = UI[lang]
    return """        <div class="header-tools">
            <button type="button" class="theme-toggle" id="themeToggle" aria-label="%s" title="%s">
                <span class="icon-dark" aria-hidden="true">🌙</span>
                <span class="icon-light" aria-hidden="true">☀️</span>
            </button>
        </div>""" % (e(u["theme_aria"]), e(u["theme"]))


SHARE_PATH = ("M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7"
              "l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24"
              ".04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 "
              "1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92"
              "-1.31 2.92-2.92-1.31-2.92-2.92-2.92z")
CHECK_PATH = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
MAIL_PATH = ("M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
             "m0 4-8 5-8-5V6l8 5 8-5v2z")
A11Y_PATH = "M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"


def footer(lang):
    u = UI[lang]
    import urllib.parse
    mailto = "mailto:%s?subject=%s" % (EMAIL, urllib.parse.quote(u["site"]))
    up = "../" if META[lang]["path"] else ""
    return """    <footer>
        <p>%s</p>

        <div class="footer-actions">
            <button type="button" class="icon-btn" id="shareBtn" aria-label="%s" title="%s">
                <svg class="i-share" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="%s"/></svg>
                <svg class="i-check" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" hidden aria-hidden="true" focusable="false"><path d="%s"/></svg>
            </button>
            <a class="icon-btn" href="%s" aria-label="%s" title="%s">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"><path d="%s"/></svg>
            </a>
            <button type="button" class="icon-btn" data-a11y="font-up" aria-label="%s" title="%s">
                <span class="a-glyph" aria-hidden="true">A+</span>
            </button>
            <button type="button" class="icon-btn" data-a11y="font-down" aria-label="%s" title="%s">
                <span class="a-glyph" aria-hidden="true">A−</span>
            </button>
            <span class="action-toast" id="shareToast" role="status" aria-live="polite"></span>
        </div>

        <div class="credit">
            <a class="credit-link" href="https://birkat-hanasi.lovable.app" target="_blank" rel="noopener"
               aria-label="%s">
                <img src="%s%s" alt="" width="86" height="86" onerror="this.remove()">
                <span class="c-txt">
                    <span class="c-lead">%s</span>
                    <span class="c-name">%s</span>
                    <span class="c-tag">%s</span>
                </span>
            </a>
        </div>

        <p class="disclaimer">%s</p>
    </footer>
""" % (e(u["footer"]), e(u["share"]), e(u["share"]), SHARE_PATH, CHECK_PATH,
       mailto, e(u["contact"]), e(u["contact"]), MAIL_PATH,
       e(u["bigger"]), e(u["bigger"]), e(u["smaller"]), e(u["smaller"]),
       e(u["credit_aria"]), up, LOGO,
       e(u["credit_lead"]), e(u["credit_name"]), e(u["credit_tag"]),
       e(SEO[lang]["disclaimer"]))


def drawer(lang):
    u = UI[lang]
    opts = [("contrast", u["a11y_contrast"]), ("grayscale", u["a11y_gray"]),
            ("underline", u["a11y_underline"]), ("readable", u["a11y_font"]),
            ("motion", u["a11y_motion"])]
    return """
    <button type="button" class="a11y-toggle" id="a11yToggle" data-a11y-open aria-expanded="false" aria-controls="a11yPanel" aria-label="%s" title="%s">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false"><path d="%s"/></svg>
    </button>
    <div class="a11y-scrim" id="a11yScrim" hidden></div>
    <div class="a11y-panel" id="a11yPanel" role="dialog" aria-modal="true" aria-labelledby="a11yTitle">
        <div class="a11y-head">
            <h2 id="a11yTitle">%s</h2>
            <button type="button" class="a11y-close" id="a11yClose" aria-label="%s">✕</button>
        </div>
        <div>
            <span class="a11y-label" id="a11ySizeLabel">%s</span>
            <div class="a11y-size">
                <button type="button" data-a11y="font-down" aria-label="%s">A−</button>
                <output id="a11ySize" for="a11ySizeLabel">100%%</output>
                <button type="button" data-a11y="font-up" aria-label="%s">A+</button>
            </div>
        </div>
%s
        <button type="button" class="a11y-reset" data-a11y="reset">%s</button>
    </div>
""" % (e(u["a11y"]), e(u["a11y"]), A11Y_PATH, e(u["a11y"]), e(u["a11y_close"]),
       e(u["a11y_size"]), e(u["smaller"]), e(u["bigger"]),
       "\n".join('        <button type="button" class="a11y-opt" data-a11y="%s" aria-pressed="false">%s</button>'
                 % (k, e(v)) for k, v in opts),
       e(u["a11y_reset"]))


def scripts(lang):
    return ('    <script src="%s"></script>\n'
            '    <script src="%s"></script>\n'
            '    <script src="%s"></script>\n'
            '    <script src="https://web-feeds.shayh22.workers.dev/embed.js"'
            ' data-site="%s" defer></script>\n'
            '    <script src="%s"></script>\n'
            % (asset(lang, "assets/theme.js"), asset(lang, "assets/share.js"),
               asset(lang, "assets/a11y.js"), ENGAGE_SITE,
               asset(lang, "assets/engage.js")))


# ---------------------------------------------------------------- pages

def figure_html(lang, slug, key, alt, cap, lead):
    rel = "images/%s-%s.jpg" % (slug, key)
    with Image.open(os.path.join(REPO, rel)) as im:
        w, h = im.size
    up = "../" if META[lang]["path"] else ""
    return ('                <figure class="%s">\n'
            '                    <img src="%s%s" alt="%s" loading="lazy" width="%d" height="%d">\n'
            '                    <figcaption>%s</figcaption>\n'
            '                </figure>' % ("story-figure lead" if lead else "story-figure",
                                           up, rel, e(alt), w, h, e(cap)))


def story_page(lang, i, tr):
    st, u = HE[i], UI[lang]
    n = st["n"]
    t, f = 0, 0
    body, first_img, first_para = [], None, None
    for kind, val in st["blocks"]:
        if kind in ("p", "h", "moral"):
            text = tr[n]["texts"][t]; t += 1
            if kind == "p":
                body.append("                <p>%s</p>" % quote_spans(text))
                if first_para is None:
                    first_para = re.sub(r"<[^>]+>", "", text)
            elif kind == "h":
                body.append('                <h3 class="story-section">%s</h3>' % e(text))
            else:
                body.append("            </div>")
                body.append('            <div class="quote-box insight">')
                body.append('                <div class="quote-title">%s</div>' % e(u["moral"]))
                body.append("                <p>%s</p>" % text)
                body.append("            </div>")
        elif kind == "img":
            alt, cap = tr[n]["figs"][f]; f += 1
            rel = "images/%s-%s.jpg" % (st["slug"], val)
            if first_img is None:
                first_img = rel
            body.append(figure_html(lang, st["slug"], val, alt, cap, f == 1))

    seo = SEO[lang][n]
    # the opening line of a fable ("in the kingdom of…") tells a search engine
    # nothing, so the description names the pattern the story is about
    desc = seo["desc"]
    page = "story-%d.html" % n
    prev_l = ('            <a href="story-%d.html"><span class="dir">%s</span><span>%s</span></a>'
              % (n - 1, e(u["prev"]), e(tr[n - 1]["title"]))) if i > 0 else "            "
    next_l = ('            <a href="story-%d.html"><span class="dir">%s</span><span>%s</span></a>'
              % (n + 1, e(u["next"]), e(tr[n + 1]["title"]))) if i < N - 1 else "            "

    # the pattern goes in the title too, where a query can match it; the brand
    # is carried by og:site_name and the structured data instead
    out = head(lang, page, "%s — %s" % (tr[n]["title"], seo["label"]), desc,
               first_img or HERO, story_jsonld(lang, n, tr, first_img, desc))
    out += """
    <header class="compact" id="top">
%s
%s
        <div class="header-content">
            <a class="home-link" href="index.html">%s</a>
            <p class="story-page">%s</p>
            <h1>%s</h1>
        </div>
    </header>

    <main>
    <article class="story-card" id="story-%d">
        <div class="story-header">
            <span class="story-tag">%s</span>
        </div>
        <div class="story-body">
%s
    </article>

        <section class="engage" aria-label="%s">
            <div class="engage-bar">
                <div data-tells="likes" data-locale="{lang}"></div>
                <div data-tells="views" data-locale="{lang}"></div>
            </div>
            <div data-tells="comments" data-locale="{lang}"></div>
        </section>

        <nav class="story-nav" aria-label="%s">
%s
            <a class="all" href="index.html"><span>%s</span></a>
%s
        </nav>
    </main>

%s%s
%s
</body>
</html>
""" % (header_tools(lang), lang_flags(lang, page), e(u["all_stories"]),
       e(u["story_of"] % (n, N)),
       e(tr[n]["title"]), n, e(u["topic"] % tr[n]["topic"]), "\n".join(body),
       e(u["engage"]), e(u["nav_aria"]), prev_l, e(u["all_stories"]), next_l,
       footer(lang), drawer(lang), scripts(lang))
    # the engagement widgets are told the page's language outright
    return out.replace('data-locale="{lang}"', 'data-locale="%s"' % lang)


def index_page(lang, tr, counts):
    u = UI[lang]
    up = "../" if META[lang]["path"] else ""
    items = []
    for i in range(N):
        n = i + 1
        badge = ('\n                            <span class="index-count">%s</span>'
                 % e(u["illustrations"] % counts[n])) if counts[n] else ""
        items.append("""                <li>
                    <a class="index-link" href="story-%d.html">
                        <span class="index-num">%d</span>
                        <span class="index-text">
                            <span class="index-title">%s</span>
                            <span class="index-topic">%s</span>%s
                        </span>
                    </a>
                </li>""" % (n, n, e(tr[n]["title"]), e(tr[n]["topic"]), badge))

    seo = SEO[lang]
    out = head(lang, "", seo["site_title"], seo["about"], HERO, index_jsonld(lang, tr))
    out += """
    <header id="top">
%s
%s
        <div class="header-content">
            <h1>%s</h1>
            <p class="subtitle">%s</p>
        </div>
    </header>

    <main>
        <figure class="hero-figure">
            <img src="%s%s" alt="%s" width="1280" height="698">
            <figcaption>%s</figcaption>
        </figure>

        <section class="lede">
            <p>%s</p>
        </section>

        <nav class="toc-card" aria-label="%s">
            <h2>%s</h2>
            <ul class="index-list">
%s
            </ul>
        </nav>

        <div class="views-line">
            <div data-tells="views" data-locale="{lang}"></div>
        </div>
    </main>

%s%s
%s
</body>
</html>
""" % (header_tools(lang), lang_flags(lang, ""), e(u["site"]),
       e(u["tagline"]), up, HERO,
       e(u["hero_caption"]), e(u["hero_caption"]), e(seo["lede"]),
       e(u["toc"]), e(u["toc"]),
       "\n".join(items), footer(lang), drawer(lang), scripts(lang))
    # the engagement widgets are told the page's language outright
    return out.replace('data-locale="{lang}"', 'data-locale="%s"' % lang)


# ---------------------------------------------------------------- crawler files

def sitemap(langs):
    rows = []
    for l in langs:
        for page in [""] + ["story-%d.html" % n for n in range(1, N + 1)]:
            alts = "".join(
                '\n    <xhtml:link rel="alternate" hreflang="%s" href="%s"/>' % (x, url(x, page))
                for x in langs)
            alts += '\n    <xhtml:link rel="alternate" hreflang="x-default" href="%s"/>' % url("he", page)
            rows.append("  <url>\n    <loc>%s</loc>%s\n    <lastmod>%s</lastmod>"
                        "\n    <changefreq>monthly</changefreq>"
                        "\n    <priority>%s</priority>\n  </url>"
                        % (url(l, page), alts, MODIFIED, "1.0" if page == "" else "0.8"))
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
            '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + "\n".join(rows) + "\n</urlset>\n")


def robots():
    return ("User-agent: *\nAllow: /\n\n"
            "# Assistants and answer engines are welcome to read and cite these texts.\n"
            "User-agent: GPTBot\nAllow: /\n\n"
            "User-agent: ClaudeBot\nAllow: /\n\n"
            "User-agent: PerplexityBot\nAllow: /\n\n"
            "User-agent: Google-Extended\nAllow: /\n\n"
            "Sitemap: %s/sitemap.xml\n" % SITE)


def llms_txt(trs):
    """The convention AI crawlers look for: what this site is, in one file.

    Written so an answer engine can tell, without reading the fables, which one
    to cite when a reader describes a pattern in their own relationship."""
    seo = SEO["en"]
    out = ["# %s (%s)" % (UI["en"]["site"], UI["he"]["site"]), "",
           "> %s" % seo["site_title"], "",
           seo["about"], "",
           seo["lede"], "",
           "%s" % seo["disclaimer"], "",
           "Published in Hebrew, English, Russian, Spanish and Chinese; each",
           "language has its own URL and its own copy of every story.", "",
           "## Stories (English)", "",
           "Each fable is about one pattern. The line after the link says which.", ""]
    for n in range(1, N + 1):
        out += ["### %d. %s" % (n, trs["en"][n]["title"]),
                "",
                "- Pattern: %s" % seo[n]["label"],
                "- Also: %s" % trs["en"][n]["topic"],
                "- Summary: %s" % seo[n]["desc"],
                "- Read: %s" % url("en", "story-%d.html" % n),
                "- Other languages: %s" % ", ".join(
                    "%s %s" % (META[l]["native"], url(l, "story-%d.html" % n))
                    for l in LANGS if l != "en"),
                ""]
    out += ["## Other languages", ""]
    for l in LANGS:
        if l == "en":
            continue
        out.append("- %s: %s — %s" % (META[l]["native"], url(l, ""), SEO[l]["site_title"]))
    out += ["", "## Licence", "",
            "Free to read, quote and cite with attribution to %s." % UI["en"]["site"], ""]
    return "\n".join(out)


# ---------------------------------------------------------------- driver

def stamp():
    import hashlib
    for a in ("assets/styles.css", "assets/theme.js", "assets/share.js",
              "assets/a11y.js", "assets/engage.js"):
        p = os.path.join(REPO, a)
        if os.path.exists(p):
            ASSET_V[a] = hashlib.sha256(open(p, "rb").read()).hexdigest()[:8]


def main(langs=None):
    stamp()
    langs = langs or [l for l in LANGS if l == "he" or os.path.exists(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "tr_%s_1_3.py" % l))]
    trs = {l: load(l) for l in langs}
    counts = {st["n"]: sum(1 for k, _ in st["blocks"] if k == "img") for st in HE}

    for l in langs:
        d = os.path.join(REPO, META[l]["path"].rstrip("/")) if META[l]["path"] else REPO
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(
            index_page(l, trs[l], counts))
        for i in range(N):
            open(os.path.join(d, "story-%d.html" % (i + 1)), "w", encoding="utf-8").write(
                story_page(l, i, trs[l]))
        print("%-3s %-9s %d pages -> %s" % (l, META[l]["native"], N + 1,
                                            META[l]["path"] or "/"))

    open(os.path.join(REPO, "sitemap.xml"), "w", encoding="utf-8").write(sitemap(langs))
    open(os.path.join(REPO, "robots.txt"), "w", encoding="utf-8").write(robots())
    if "en" in trs:
        open(os.path.join(REPO, "llms.txt"), "w", encoding="utf-8").write(llms_txt(trs))
    print("sitemap.xml, robots.txt, llms.txt written for:", " ".join(langs))


if __name__ == "__main__":
    main(sys.argv[1:] or None)
