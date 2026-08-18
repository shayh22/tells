/* Tells Engage — embeddable comments and likes.
 *
 *   <script src="https://your-server/embed.js" data-site="st_xxx" defer></script>
 *   <div data-tells="likes"></div>
 *   <div data-tells="comments"></div>
 *
 * No dependencies, no build step, one network request. The script finds its own
 * server from its src, so the same snippet works on every site.
 */
(function () {
    'use strict';

    var script = document.currentScript || (function () {
        var all = document.getElementsByTagName('script');
        return all[all.length - 1];
    })();

    var BASE = (function () {
        try {
            return new URL(script.src, window.location.href).origin;
        } catch (error) {
            return '';
        }
    })();

    var DEFAULT_SITE = script.getAttribute('data-site') || script.getAttribute('data-tells-site') || '';

    var STRINGS = {
        he: {
            comments: 'תגובות',
            noComments: 'עדיין אין תגובות. תהיו הראשונים.',
            writeComment: 'כתבו תגובה…',
            send: 'שליחה',
            sending: 'שולח…',
            reply: 'תגובה',
            replyTo: 'בתגובה ל־',
            cancel: 'ביטול',
            identityTitle: 'רגע לפני שכותבים',
            identityLead: 'רישום מהיר בשלב אחד — או תגובה אנונימית.',
            emailLabel: 'אימייל',
            nameLabel: 'שם לתצוגה (לא חובה)',
            registerEmail: 'הרשמה עם אימייל',
            continueAnonymous: 'המשך כאנונימי',
            registering: 'רושם…',
            signedInAs: 'מגיבים בתור',
            anonymous: 'אנונימי',
            switchIdentity: 'החלפת זהות',
            pendingNotice: 'התגובה נשלחה וממתינה לאישור.',
            publishedNotice: 'התגובה פורסמה.',
            moderationNote: 'התגובות עוברות אישור לפני פרסום.',
            likeAdd: 'אהבתי',
            likeRemove: 'ביטול לייק',
            likesCount: 'לייקים',
            loadError: 'לא הצלחנו לטעון את התגובות.',
            genericError: 'משהו השתבש. נסו שוב.',
            commentsClosed: 'התגובות סגורות.',
            charactersLeft: 'תווים שנותרו',
            justNow: 'הרגע',
        },
        en: {
            comments: 'Comments',
            noComments: 'No comments yet. Be the first.',
            writeComment: 'Write a comment…',
            send: 'Send',
            sending: 'Sending…',
            reply: 'Reply',
            replyTo: 'Replying to ',
            cancel: 'Cancel',
            identityTitle: 'Before you write',
            identityLead: 'One-step signup — or comment anonymously.',
            emailLabel: 'Email',
            nameLabel: 'Display name (optional)',
            registerEmail: 'Sign up with email',
            continueAnonymous: 'Continue anonymously',
            registering: 'Signing up…',
            signedInAs: 'Commenting as',
            anonymous: 'Anonymous',
            switchIdentity: 'Switch identity',
            pendingNotice: 'Your comment was sent and is awaiting approval.',
            publishedNotice: 'Your comment was published.',
            moderationNote: 'Comments are reviewed before they appear.',
            likeAdd: 'Like',
            likeRemove: 'Unlike',
            likesCount: 'likes',
            loadError: 'We could not load the comments.',
            genericError: 'Something went wrong. Please try again.',
            commentsClosed: 'Comments are closed.',
            charactersLeft: 'characters left',
            justNow: 'just now',
        },
    };

    var CSS = [
        '.tlx{--tlx-fg:#1f2937;--tlx-muted:#6b7280;--tlx-bg:transparent;--tlx-card:#ffffff;',
        '--tlx-border:rgba(15,23,42,.12);--tlx-accent:#4f46e5;--tlx-accent-fg:#ffffff;--tlx-radius:14px;',
        'color:var(--tlx-fg);font:inherit;line-height:1.6;box-sizing:border-box;max-width:100%}',
        '.tlx *,.tlx *::before,.tlx *::after{box-sizing:inherit}',
        '@media (prefers-color-scheme:dark){.tlx{--tlx-fg:#e5e7eb;--tlx-muted:#9ca3af;--tlx-card:rgba(255,255,255,.04);',
        '--tlx-border:rgba(255,255,255,.14);--tlx-accent:#818cf8}}',
        '.tlx[data-theme="dark"]{--tlx-fg:#e5e7eb;--tlx-muted:#9ca3af;--tlx-card:rgba(255,255,255,.04);',
        '--tlx-border:rgba(255,255,255,.14);--tlx-accent:#818cf8}',
        '.tlx[data-theme="light"]{--tlx-fg:#1f2937;--tlx-muted:#6b7280;--tlx-card:#ffffff;',
        '--tlx-border:rgba(15,23,42,.12);--tlx-accent:#4f46e5}',
        '.tlx-h{display:flex;align-items:center;gap:.5rem;margin:0 0 1rem;font-size:1.15rem;font-weight:700}',
        '.tlx-count{font-size:.85rem;font-weight:600;color:var(--tlx-muted)}',
        '.tlx-list{display:flex;flex-direction:column;gap:.75rem;margin:0 0 1.25rem;padding:0;list-style:none}',
        '.tlx-item{background:var(--tlx-card);border:1px solid var(--tlx-border);border-radius:var(--tlx-radius);padding:.85rem 1rem}',
        '.tlx-item.tlx-reply{margin-inline-start:1.75rem}',
        '.tlx-item.tlx-pending{border-style:dashed;opacity:.75}',
        '.tlx-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;margin-bottom:.35rem}',
        '.tlx-author{font-weight:700}',
        '.tlx-badge{font-size:.7rem;padding:.1rem .45rem;border-radius:999px;border:1px solid var(--tlx-border);color:var(--tlx-muted)}',
        '.tlx-time{font-size:.78rem;color:var(--tlx-muted)}',
        '.tlx-body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}',
        '.tlx-body a{color:var(--tlx-accent)}',
        '.tlx-actions{margin-top:.4rem}',
        '.tlx-link{background:none;border:0;padding:0;font:inherit;font-size:.8rem;color:var(--tlx-accent);cursor:pointer}',
        '.tlx-link:hover{text-decoration:underline}',
        '.tlx-empty,.tlx-note{color:var(--tlx-muted);font-size:.9rem;margin:0 0 1rem}',
        '.tlx-form{background:var(--tlx-card);border:1px solid var(--tlx-border);border-radius:var(--tlx-radius);padding:1rem;display:flex;flex-direction:column;gap:.6rem}',
        '.tlx-form textarea,.tlx-form input,.tlx-idcard input{width:100%;font:inherit;color:inherit;background:transparent;',
        'border:1px solid var(--tlx-border);border-radius:10px;padding:.6rem .75rem;resize:vertical}',
        '.tlx-form textarea{min-height:5.5rem}',
        '.tlx-form textarea:focus,.tlx-form input:focus,.tlx-idcard input:focus{outline:2px solid var(--tlx-accent);outline-offset:1px}',
        '.tlx-idcard form{display:flex;flex-direction:column;gap:.5rem}',
        '.tlx-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.6rem}',
        '.tlx-btn{font:inherit;font-weight:600;cursor:pointer;border-radius:999px;padding:.5rem 1.15rem;',
        'border:1px solid var(--tlx-accent);background:var(--tlx-accent);color:var(--tlx-accent-fg);transition:opacity .15s ease,transform .15s ease}',
        '.tlx-btn:hover:not(:disabled){opacity:.88}',
        '.tlx-btn:disabled{opacity:.55;cursor:default}',
        '.tlx-btn.tlx-ghost{background:transparent;color:var(--tlx-fg);border-color:var(--tlx-border)}',
        '.tlx-hp{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
        '.tlx-msg{font-size:.88rem;border-radius:10px;padding:.5rem .75rem;border:1px solid var(--tlx-border)}',
        '.tlx-msg.tlx-ok{color:#166534;background:rgba(22,163,74,.12);border-color:rgba(22,163,74,.35)}',
        '.tlx-msg.tlx-err{color:#b91c1c;background:rgba(220,38,38,.1);border-color:rgba(220,38,38,.35)}',
        '@media (prefers-color-scheme:dark){.tlx-msg.tlx-ok{color:#86efac}.tlx-msg.tlx-err{color:#fca5a5}}',
        '.tlx-id{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;font-size:.85rem;color:var(--tlx-muted)}',
        '.tlx-idcard{background:var(--tlx-card);border:1px solid var(--tlx-border);border-radius:var(--tlx-radius);padding:1rem;display:flex;flex-direction:column;gap:.6rem}',
        '.tlx-idcard h4{margin:0;font-size:1rem}',
        '.tlx-idcard p{margin:0;color:var(--tlx-muted);font-size:.88rem}',
        '.tlx-idrow{display:flex;flex-wrap:wrap;gap:.5rem}',
        '.tlx-idrow .tlx-btn{flex:1 1 auto}',
        '.tlx-like{display:inline-flex;align-items:center;gap:.5rem;font:inherit;font-weight:600;cursor:pointer;',
        'border:1px solid var(--tlx-border);background:var(--tlx-card);color:var(--tlx-fg);',
        'border-radius:999px;padding:.45rem 1rem;transition:transform .15s ease,border-color .15s ease}',
        '.tlx-like:hover:not(:disabled){transform:translateY(-1px);border-color:var(--tlx-accent)}',
        '.tlx-like:disabled{opacity:.6;cursor:default}',
        '.tlx-like[aria-pressed="true"]{border-color:var(--tlx-accent);color:var(--tlx-accent)}',
        '.tlx-heart{font-size:1.1em;line-height:1;transition:transform .2s ease}',
        '.tlx-like[aria-pressed="true"] .tlx-heart{transform:scale(1.15)}',
        '@media (prefers-reduced-motion:reduce){.tlx *{transition:none!important}}',
    ].join('');

    function injectStyles() {
        if (document.getElementById('tlx-styles')) return;
        var style = document.createElement('style');
        style.id = 'tlx-styles';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    /* Comment bodies are inserted as text; only bare URLs become links, and
       those are built as elements so nothing in the string can become markup. */
    function renderBody(text) {
        var wrapper = el('p', 'tlx-body');
        var pattern = /(https?:\/\/[^\s<>"']+)/g;
        var lastIndex = 0;
        var match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > lastIndex) {
                wrapper.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            var link = el('a', null, match[0]);
            link.href = match[0];
            link.target = '_blank';
            link.rel = 'nofollow ugc noopener noreferrer';
            wrapper.appendChild(link);
            lastIndex = match.index + match[0].length;
        }
        wrapper.appendChild(document.createTextNode(text.slice(lastIndex)));
        return wrapper;
    }

    function timeAgo(iso, locale, strings) {
        var then = new Date(iso).getTime();
        if (!then) return '';
        var seconds = Math.round((Date.now() - then) / 1000);
        if (seconds < 45) return strings.justNow;
        var units = [
            ['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800],
            ['month', 2592000], ['year', 31536000],
        ];
        var unit = 'minute';
        var value = seconds / 60;
        for (var i = units.length - 1; i >= 0; i -= 1) {
            if (seconds >= units[i][1]) {
                unit = units[i][0];
                value = seconds / units[i][1];
                break;
            }
        }
        try {
            var formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
            return formatter.format(-Math.round(value), unit);
        } catch (error) {
            return new Date(iso).toLocaleDateString(locale);
        }
    }

    function request(path, options) {
        options = options || {};
        var headers = { 'content-type': 'application/json' };
        if (options.token) headers.authorization = 'Bearer ' + options.token;
        return fetch(BASE + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: 'omit',
            mode: 'cors',
        }).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) {
                    var error = new Error(payload.message || 'request failed');
                    error.code = payload.error || 'error';
                    error.status = response.status;
                    throw error;
                }
                return payload;
            });
        });
    }

    /* One identity per site, kept in localStorage so a visitor registers once
       and keeps commenting across pages. */
    function identityStore(siteKey) {
        var key = 'tells.engage.' + siteKey;
        return {
            read: function () {
                try {
                    var raw = window.localStorage.getItem(key);
                    return raw ? JSON.parse(raw) : null;
                } catch (error) {
                    return null;
                }
            },
            write: function (value) {
                try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* private mode */ }
            },
            clear: function () {
                try { window.localStorage.removeItem(key); } catch (error) { /* private mode */ }
            },
        };
    }

    function pagePathOf(node) {
        var explicit = node.getAttribute('data-page');
        if (explicit) return explicit;
        return window.location.pathname;
    }

    function Widget(node) {
        this.node = node;
        this.siteKey = node.getAttribute('data-site') || DEFAULT_SITE;
        this.kind = (node.getAttribute('data-tells') || 'comments').toLowerCase();
        this.page = pagePathOf(node);
        this.pageTitle = node.getAttribute('data-title') || document.title;
        this.locale = node.getAttribute('data-locale') || 'he';
        this.strings = STRINGS[this.locale] || STRINGS.he;
        this.store = identityStore(this.siteKey);
        this.identity = this.store.read();
        this.site = null;
        this.replyTo = null;
        this.notice = null;
        node.classList.add('tlx');
        if (node.getAttribute('data-theme')) node.setAttribute('data-theme', node.getAttribute('data-theme'));
    }

    Widget.prototype.token = function () {
        return this.identity && this.identity.token ? this.identity.token : '';
    };

    Widget.prototype.query = function (extra) {
        var params = new URLSearchParams({ site: this.siteKey, page: this.page });
        if (extra) Object.keys(extra).forEach(function (key) { params.set(key, extra[key]); });
        return '?' + params.toString();
    };

    Widget.prototype.fail = function (message) {
        this.node.textContent = '';
        this.node.appendChild(el('p', 'tlx-msg tlx-err', message));
    };

    /* ---- identity ---- */

    Widget.prototype.renderIdentityGate = function (container, onReady) {
        var self = this;
        var strings = this.strings;
        var card = el('div', 'tlx-idcard');
        card.appendChild(el('h4', null, strings.identityTitle));
        card.appendChild(el('p', null, strings.identityLead));

        var form = el('form');
        form.setAttribute('novalidate', 'novalidate');
        var email = el('input');
        email.type = 'email';
        email.name = 'email';
        email.required = true;
        email.autocomplete = 'email';
        email.placeholder = strings.emailLabel;
        email.setAttribute('aria-label', strings.emailLabel);

        var name = el('input');
        name.type = 'text';
        name.name = 'name';
        name.autocomplete = 'nickname';
        name.maxLength = 60;
        name.placeholder = strings.nameLabel;
        name.setAttribute('aria-label', strings.nameLabel);

        var row = el('div', 'tlx-idrow');
        var submit = el('button', 'tlx-btn', strings.registerEmail);
        submit.type = 'submit';
        row.appendChild(submit);

        var anonButton = null;
        if (this.site && this.site.allowAnonymous) {
            anonButton = el('button', 'tlx-btn tlx-ghost', strings.continueAnonymous);
            anonButton.type = 'button';
            row.appendChild(anonButton);
        }

        var message = el('div', 'tlx-msg tlx-err');
        message.hidden = true;

        form.appendChild(email);
        form.appendChild(name);
        form.appendChild(row);
        card.appendChild(form);
        card.appendChild(message);
        container.appendChild(card);

        function register(payload, button) {
            message.hidden = true;
            var previous = button.textContent;
            button.disabled = true;
            button.textContent = strings.registering;
            if (anonButton) anonButton.disabled = true;
            submit.disabled = true;

            request('/api/v1/visitors' + self.query(), { method: 'POST', body: payload })
                .then(function (data) {
                    self.identity = { token: data.token, visitor: data.visitor };
                    self.store.write(self.identity);
                    onReady();
                })
                .catch(function (error) {
                    message.textContent = error.message || strings.genericError;
                    message.hidden = false;
                })
                .then(function () {
                    button.disabled = false;
                    button.textContent = previous;
                    if (anonButton) anonButton.disabled = false;
                    submit.disabled = false;
                });
        }

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            register({ site: self.siteKey, mode: 'email', email: email.value, name: name.value }, submit);
        });
        if (anonButton) {
            anonButton.addEventListener('click', function () {
                register({ site: self.siteKey, mode: 'anonymous', name: name.value }, anonButton);
            });
        }
    };

    Widget.prototype.renderIdentityBar = function (container, onSwitch) {
        var strings = this.strings;
        var visitor = this.identity.visitor || {};
        var bar = el('div', 'tlx-id');
        var who = visitor.kind === 'anonymous' ? (visitor.name || strings.anonymous) : (visitor.name || visitor.email);
        bar.appendChild(el('span', null, strings.signedInAs + ' ' + who));
        var switcher = el('button', 'tlx-link', strings.switchIdentity);
        switcher.type = 'button';
        switcher.addEventListener('click', onSwitch);
        bar.appendChild(switcher);
        container.appendChild(bar);
    };

    /* ---- likes ---- */

    Widget.prototype.mountLikes = function () {
        var self = this;
        var strings = this.strings;
        this.node.textContent = '';

        var button = el('button', 'tlx-like');
        button.type = 'button';
        button.disabled = true;
        button.setAttribute('aria-pressed', 'false');
        var heart = el('span', 'tlx-heart', '♡');
        var count = el('span', 'tlx-likecount', '0');
        var label = el('span', 'tlx-likelabel', strings.likeAdd);
        button.appendChild(heart);
        button.appendChild(count);
        button.appendChild(label);
        this.node.appendChild(button);

        var error = el('p', 'tlx-msg tlx-err');
        error.hidden = true;
        this.node.appendChild(error);

        function paint(data) {
            count.textContent = String(data.count);
            button.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
            heart.textContent = data.liked ? '♥' : '♡';
            label.textContent = data.liked ? strings.likeRemove : strings.likeAdd;
            button.setAttribute('aria-label', label.textContent + ' — ' + data.count + ' ' + strings.likesCount);
        }

        function ensureIdentity() {
            if (self.token()) return Promise.resolve();
            /* Likes never interrupt with a form: when the site allows anonymous
               visitors we mint one silently, otherwise we point at the comments
               widget where the email signup lives. */
            if (self.site && self.site.allowAnonymous) {
                return request('/api/v1/visitors' + self.query(), {
                    method: 'POST',
                    body: { site: self.siteKey, mode: 'anonymous' },
                }).then(function (data) {
                    self.identity = { token: data.token, visitor: data.visitor };
                    self.store.write(self.identity);
                });
            }
            return Promise.reject(Object.assign(new Error(strings.identityLead), { code: 'identity_required' }));
        }

        button.addEventListener('click', function () {
            button.disabled = true;
            error.hidden = true;
            ensureIdentity()
                .then(function () {
                    return request('/api/v1/likes' + self.query(), {
                        method: 'POST',
                        token: self.token(),
                        body: {
                            site: self.siteKey,
                            page: self.page,
                            pageUrl: window.location.href,
                            pageTitle: self.pageTitle,
                        },
                    });
                })
                .then(paint)
                .catch(function (err) {
                    if (err.status === 401) self.store.clear();
                    error.textContent = err.message || strings.genericError;
                    error.hidden = false;
                })
                .then(function () { button.disabled = false; });
        });

        request('/api/v1/likes' + self.query(), { token: self.token() })
            .then(function (data) {
                self.site = data.site;
                paint(data);
                button.disabled = false;
            })
            .catch(function (err) {
                error.textContent = err.message || strings.genericError;
                error.hidden = false;
            });
    };

    /* ---- comments ---- */

    Widget.prototype.mountComments = function () {
        var self = this;
        this.node.textContent = '';
        var loading = el('p', 'tlx-note', '…');
        this.node.appendChild(loading);
        this.load();
    };

    Widget.prototype.load = function () {
        var self = this;
        request('/api/v1/comments' + this.query(), { token: this.token() })
            .then(function (data) {
                self.site = data.site;
                if (data.visitor) {
                    self.identity = { token: self.token(), visitor: data.visitor };
                    self.store.write(self.identity);
                } else if (self.identity && self.token()) {
                    /* The stored token no longer resolves (site key rotated, or
                       the visitor was removed): start over cleanly. */
                    self.store.clear();
                    self.identity = null;
                }
                self.render(data);
            })
            .catch(function (error) {
                self.fail(error.message || self.strings.loadError);
            });
    };

    Widget.prototype.render = function (data) {
        var self = this;
        var strings = this.strings;
        var node = this.node;
        node.textContent = '';

        var heading = el('h3', 'tlx-h');
        heading.appendChild(document.createTextNode(strings.comments));
        heading.appendChild(el('span', 'tlx-count', '(' + data.total + ')'));
        node.appendChild(heading);

        var byParent = {};
        data.comments.forEach(function (comment) {
            if (!comment.parentId) return;
            (byParent[comment.parentId] = byParent[comment.parentId] || []).push(comment);
        });

        if (!data.comments.length && !data.pending.length) {
            node.appendChild(el('p', 'tlx-empty', strings.noComments));
        } else {
            var list = el('ul', 'tlx-list');
            data.comments.forEach(function (comment) {
                if (comment.parentId) return;
                list.appendChild(self.commentItem(comment, false));
                (byParent[comment.id] || []).forEach(function (reply) {
                    list.appendChild(self.commentItem(reply, true));
                });
            });
            data.pending.forEach(function (comment) {
                list.appendChild(self.commentItem(comment, !!comment.parentId, true));
            });
            node.appendChild(list);
        }

        if (!data.site.commentsEnabled) {
            node.appendChild(el('p', 'tlx-note', strings.commentsClosed));
            return;
        }

        var formArea = el('div', 'tlx-formarea');
        node.appendChild(formArea);
        this.renderComposer(formArea);
    };

    Widget.prototype.commentItem = function (comment, isReply, pending) {
        var strings = this.strings;
        var item = el('li', 'tlx-item' + (isReply ? ' tlx-reply' : '') + (pending ? ' tlx-pending' : ''));
        var meta = el('div', 'tlx-meta');
        meta.appendChild(el('span', 'tlx-author', comment.author));
        if (comment.isAnonymous) meta.appendChild(el('span', 'tlx-badge', strings.anonymous));
        if (pending) meta.appendChild(el('span', 'tlx-badge', strings.pendingNotice));
        meta.appendChild(el('span', 'tlx-time', timeAgo(comment.createdAt, this.locale, strings)));
        item.appendChild(meta);
        item.appendChild(renderBody(comment.body));

        if (!pending && !isReply) {
            var actions = el('div', 'tlx-actions');
            var reply = el('button', 'tlx-link', strings.reply);
            reply.type = 'button';
            var self = this;
            reply.addEventListener('click', function () {
                self.replyTo = { id: comment.id, author: comment.author };
                var textarea = self.node.querySelector('.tlx-form textarea');
                if (textarea) textarea.focus();
                self.refreshReplyBanner();
            });
            actions.appendChild(reply);
            item.appendChild(actions);
        }
        return item;
    };

    Widget.prototype.refreshReplyBanner = function () {
        var banner = this.node.querySelector('.tlx-replybanner');
        if (!banner) return;
        if (!this.replyTo) {
            banner.hidden = true;
            return;
        }
        banner.hidden = false;
        banner.textContent = '';
        banner.appendChild(document.createTextNode(this.strings.replyTo + this.replyTo.author + ' '));
        var cancel = el('button', 'tlx-link', this.strings.cancel);
        cancel.type = 'button';
        var self = this;
        cancel.addEventListener('click', function () {
            self.replyTo = null;
            self.refreshReplyBanner();
        });
        banner.appendChild(cancel);
    };

    Widget.prototype.renderComposer = function (container) {
        var self = this;
        var strings = this.strings;
        container.textContent = '';

        if (!this.token()) {
            this.renderIdentityGate(container, function () {
                self.load();
            });
            return;
        }

        this.renderIdentityBar(container, function () {
            self.store.clear();
            self.identity = null;
            self.renderComposer(container);
        });

        var form = el('form', 'tlx-form');
        var banner = el('div', 'tlx-replybanner tlx-note');
        banner.hidden = true;
        form.appendChild(banner);

        var textarea = el('textarea');
        textarea.placeholder = strings.writeComment;
        textarea.required = true;
        textarea.maxLength = 2000;
        textarea.setAttribute('aria-label', strings.writeComment);
        form.appendChild(textarea);

        /* Honeypot: a real visitor never sees it, a naive bot fills it in. */
        var honeypot = el('input', 'tlx-hp');
        honeypot.type = 'text';
        honeypot.name = 'website';
        honeypot.tabIndex = -1;
        honeypot.setAttribute('autocomplete', 'off');
        honeypot.setAttribute('aria-hidden', 'true');
        form.appendChild(honeypot);

        var row = el('div', 'tlx-row');
        var counter = el('span', 'tlx-count', '2000 ' + strings.charactersLeft);
        var submit = el('button', 'tlx-btn', strings.send);
        submit.type = 'submit';
        row.appendChild(counter);
        row.appendChild(submit);
        form.appendChild(row);

        if (this.site && this.site.moderation === 'pre') {
            form.appendChild(el('p', 'tlx-note', strings.moderationNote));
        }

        var message = el('div', 'tlx-msg');
        message.hidden = true;
        if (this.notice) {
            message.className = 'tlx-msg tlx-ok';
            message.textContent = this.notice;
            message.hidden = false;
            this.notice = null;
        }
        form.appendChild(message);

        textarea.addEventListener('input', function () {
            counter.textContent = (2000 - textarea.value.length) + ' ' + strings.charactersLeft;
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            if (!textarea.value.trim()) return;
            submit.disabled = true;
            submit.textContent = strings.sending;
            message.hidden = true;

            request('/api/v1/comments' + self.query(), {
                method: 'POST',
                token: self.token(),
                body: {
                    site: self.siteKey,
                    page: self.page,
                    pageUrl: window.location.href,
                    pageTitle: self.pageTitle,
                    body: textarea.value,
                    parentId: self.replyTo ? self.replyTo.id : null,
                    hp: honeypot.value,
                },
            })
                .then(function (data) {
                    textarea.value = '';
                    self.replyTo = null;
                    counter.textContent = '2000 ' + strings.charactersLeft;
                    /* The list reloads right after, which rebuilds this form —
                       so the confirmation travels with the widget, not with the
                       element that is about to be replaced. */
                    self.notice = data.status === 'approved' ? strings.publishedNotice : strings.pendingNotice;
                    self.load();
                })
                .catch(function (error) {
                    if (error.status === 401) {
                        self.store.clear();
                        self.identity = null;
                        self.renderComposer(container);
                        return;
                    }
                    message.className = 'tlx-msg tlx-err';
                    message.textContent = error.message || strings.genericError;
                    message.hidden = false;
                })
                .then(function () {
                    submit.disabled = false;
                    submit.textContent = strings.send;
                });
        });

        container.appendChild(form);
        this.refreshReplyBanner();
    };

    Widget.prototype.mount = function () {
        if (!this.siteKey) {
            this.fail('Tells Engage: missing data-site');
            return;
        }
        if (this.kind === 'likes') this.mountLikes();
        else this.mountComments();
    };

    function mountAll(root) {
        injectStyles();
        var nodes = (root || document).querySelectorAll('[data-tells]:not([data-tells-mounted])');
        Array.prototype.forEach.call(nodes, function (node) {
            node.setAttribute('data-tells-mounted', '1');
            new Widget(node).mount();
        });
    }

    window.TellsEngage = {
        base: BASE,
        mount: mountAll,
        /* Programmatic mount for apps that render their containers later. */
        mountElement: function (node, options) {
            injectStyles();
            options = options || {};
            Object.keys(options).forEach(function (key) {
                var attr = key === 'widget' ? 'data-tells' : 'data-' + key.toLowerCase();
                node.setAttribute(attr, options[key]);
            });
            if (!node.getAttribute('data-tells')) node.setAttribute('data-tells', 'comments');
            node.setAttribute('data-tells-mounted', '1');
            new Widget(node).mount();
        },
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { mountAll(); });
    } else {
        mountAll();
    }
})();
