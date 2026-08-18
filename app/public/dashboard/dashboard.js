/* Dashboard client. Vanilla DOM on purpose: it is served by the same process
   that owns the data, and every value it renders comes from a moderator's own
   database — but it is still visitor-written text, so nothing is ever inserted
   as HTML. */
(function () {
    'use strict';

    var state = {
        view: 'overview',
        sites: [],
        comments: { status: 'pending', site: '', q: '', offset: 0, limit: 25, total: 0 },
        selection: new Set(),
        editingSite: null,
    };

    /* ---- helpers ---- */

    function h(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
        return node;
    }

    function $(selector, root) { return (root || document).querySelector(selector); }
    function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

    var toastTimer = null;
    function toast(message, isError) {
        var node = $('#toast');
        node.textContent = message;
        node.className = 'toast' + (isError ? ' error' : '');
        node.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { node.hidden = true; }, 3200);
    }

    function api(path, options) {
        options = options || {};
        return fetch('/admin/api' + path, {
            method: options.method || 'GET',
            headers: { 'content-type': 'application/json', 'x-tells-admin': '1' },
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: 'same-origin',
        }).then(function (response) {
            if (response.status === 401 && path !== '/login' && path !== '/session') {
                showLogin();
                throw new Error('unauthorized');
            }
            return response.json().catch(function () { return {}; }).then(function (payload) {
                if (!response.ok) {
                    var error = new Error(payload.message || 'שגיאה בשרת');
                    error.code = payload.error;
                    throw error;
                }
                return payload;
            });
        });
    }

    function formatDate(iso) {
        if (!iso) return '';
        var date = new Date(iso);
        return date.toLocaleString('he-IL', {
            day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    }

    var STATUS_LABEL = { pending: 'ממתינה', approved: 'מאושרת', rejected: 'נדחתה' };

    function table(headers, rows) {
        var wrap = h('table');
        var thead = h('thead');
        var tr = h('tr');
        headers.forEach(function (label) { tr.appendChild(h('th', null, label)); });
        thead.appendChild(tr);
        wrap.appendChild(thead);
        var tbody = h('tbody');
        rows.forEach(function (cells) {
            var row = h('tr');
            cells.forEach(function (cell) {
                if (cell && cell.nodeType === 1) {
                    var td = h('td');
                    td.appendChild(cell);
                    row.appendChild(td);
                } else if (cell && typeof cell === 'object') {
                    row.appendChild(h('td', cell.className, cell.text));
                } else {
                    row.appendChild(h('td', null, cell));
                }
            });
            tbody.appendChild(row);
        });
        wrap.appendChild(tbody);
        return wrap;
    }

    function renderInto(container, node, emptyText) {
        clear(container);
        if (!node) {
            container.appendChild(h('p', 'empty', emptyText || 'אין נתונים להצגה.'));
            return;
        }
        container.appendChild(node);
    }

    /* ---- auth ---- */

    function showLogin() {
        $('#app').hidden = true;
        $('#login').hidden = false;
        $('#password').focus();
    }

    function showApp() {
        $('#login').hidden = true;
        $('#app').hidden = false;
        loadSites().then(function () { switchView(state.view); });
    }

    $('#loginForm').addEventListener('submit', function (event) {
        event.preventDefault();
        var error = $('#loginError');
        error.hidden = true;
        api('/login', { method: 'POST', body: { password: $('#password').value } })
            .then(function () {
                $('#password').value = '';
                showApp();
            })
            .catch(function (err) {
                error.textContent = err.message || 'ההתחברות נכשלה';
                error.hidden = false;
            });
    });

    $('#logout').addEventListener('click', function () {
        api('/logout', { method: 'POST' }).then(showLogin).catch(showLogin);
    });

    /* ---- navigation ---- */

    function switchView(name) {
        state.view = name;
        $$('.nav-item').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.view === name);
        });
        $$('.view').forEach(function (section) {
            section.classList.toggle('is-active', section.dataset.view === name);
        });
        var loaders = {
            overview: loadOverview,
            comments: loadComments,
            likes: loadLikes,
            sites: renderSites,
            visitors: loadVisitors,
            settings: loadSettings,
        };
        if (loaders[name]) loaders[name]();
    }

    $$('.nav-item').forEach(function (button) {
        button.addEventListener('click', function () { switchView(button.dataset.view); });
    });

    $$('[data-refresh]').forEach(function (button) {
        button.addEventListener('click', function () { switchView(button.dataset.refresh); });
    });

    /* ---- overview ---- */

    function loadOverview() {
        api('/overview').then(function (data) {
            var grid = clear($('#statGrid'));
            [
                { label: 'תגובות ממתינות', value: data.totals.pending, attention: data.totals.pending > 0 },
                { label: 'תגובות מאושרות', value: data.totals.approved },
                { label: 'סה"כ תגובות', value: data.totals.comments },
                { label: 'לייקים', value: data.totals.likes },
                { label: 'מבקרים רשומים', value: data.totals.visitors },
                { label: 'אתרים', value: data.totals.sites },
            ].forEach(function (item) {
                var card = h('div', 'stat' + (item.attention ? ' attention' : ''));
                card.appendChild(h('div', 'value', String(item.value)));
                card.appendChild(h('div', 'label', item.label));
                grid.appendChild(card);
            });

            updatePendingBadge(data.totals.pending);
            renderChart(data.daily, data.dailyLikes);

            renderInto($('#topPages'), data.topPages.length ? table(
                ['אתר', 'דף', 'לייקים'],
                data.topPages.map(function (row) {
                    return [row.site_name, row.page_title || row.page_path, { text: String(row.likes), className: 'num' }];
                }),
            ) : null, 'עדיין אין לייקים.');

            renderInto($('#perSite'), data.perSite.length ? table(
                ['אתר', 'תגובות', 'ממתינות', 'לייקים', 'מבקרים'],
                data.perSite.map(function (row) {
                    return [
                        row.name,
                        { text: String(row.comments), className: 'num' },
                        { text: String(row.pending), className: 'num' },
                        { text: String(row.likes), className: 'num' },
                        { text: String(row.visitors), className: 'num' },
                    ];
                }),
            ) : null, 'עדיין לא הוגדרו אתרים.');

            var latest = clear($('#latestComments'));
            if (!data.latest.length) {
                latest.appendChild(h('p', 'empty', 'עדיין אין תגובות.'));
            } else {
                data.latest.forEach(function (comment) {
                    latest.appendChild(commentCard(comment, { compact: true }));
                });
            }
        }).catch(function (error) { toast(error.message, true); });
    }

    /* Two stacked bars per day: comments on top of likes, scaled to the busiest
       day in the window so a quiet fortnight still reads clearly. */
    function renderChart(daily, dailyLikes) {
        var chart = clear($('#activityChart'));
        var byDay = {};
        var days = [];
        for (var i = 13; i >= 0; i -= 1) {
            var day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            byDay[day] = { comments: 0, likes: 0 };
            days.push(day);
        }
        daily.forEach(function (row) { if (byDay[row.day]) byDay[row.day].comments = row.comments; });
        dailyLikes.forEach(function (row) { if (byDay[row.day]) byDay[row.day].likes = row.likes; });

        var max = 1;
        days.forEach(function (day) { max = Math.max(max, byDay[day].comments + byDay[day].likes); });

        days.forEach(function (day) {
            var column = h('div', 'col');
            column.title = day + ' — ' + byDay[day].comments + ' תגובות, ' + byDay[day].likes + ' לייקים';
            var comments = h('div', 'bar');
            comments.style.height = Math.round((byDay[day].comments / max) * 100) + '%';
            var likes = h('div', 'bar likes');
            likes.style.height = Math.round((byDay[day].likes / max) * 100) + '%';
            column.appendChild(comments);
            column.appendChild(likes);
            /* Day of month only: the full date is in the column's tooltip, and a
               longer label would force the columns wider than the panel. */
            column.appendChild(h('div', 'day', day.slice(8)));
            chart.appendChild(column);
        });
    }

    function updatePendingBadge(count) {
        var pill = $('#pendingPill');
        pill.textContent = String(count);
        pill.hidden = !count;
    }

    /* ---- comments ---- */

    function commentCard(comment, options) {
        options = options || {};
        var card = h('div', 'comment ' + comment.status);

        if (!options.compact) {
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = state.selection.has(comment.id);
            checkbox.setAttribute('aria-label', 'בחירת תגובה');
            checkbox.addEventListener('change', function () {
                if (checkbox.checked) state.selection.add(comment.id);
                else state.selection.delete(comment.id);
                renderBulkBar();
            });
            card.appendChild(checkbox);
        } else {
            card.appendChild(h('span'));
        }

        var main = h('div', 'comment-main');
        var meta = h('div', 'comment-meta');
        meta.appendChild(h('strong', null, comment.author));
        if (comment.isAnonymous) meta.appendChild(h('span', 'tag', 'אנונימי'));
        else if (comment.email) meta.appendChild(h('span', null, comment.email));
        meta.appendChild(h('span', 'tag status-' + comment.status, STATUS_LABEL[comment.status] || comment.status));
        meta.appendChild(h('span', null, comment.siteName));
        var pageLink = comment.pageUrl ? h('a', null, comment.pageTitle || comment.pagePath) : h('span', null, comment.pagePath);
        if (comment.pageUrl) {
            pageLink.href = comment.pageUrl;
            pageLink.target = '_blank';
            pageLink.rel = 'noopener noreferrer';
        }
        meta.appendChild(pageLink);
        meta.appendChild(h('span', null, formatDate(comment.createdAt)));
        if (comment.spamScore >= 40) meta.appendChild(h('span', 'tag spam', 'חשד לספאם ' + comment.spamScore));
        if (comment.parentId) meta.appendChild(h('span', 'tag', 'תשובה'));
        main.appendChild(meta);
        main.appendChild(h('p', 'comment-body', comment.body));

        if (!options.compact) {
            var actions = h('div', 'comment-actions');
            if (comment.status !== 'approved') {
                actions.appendChild(actionButton('אישור', 'btn small primary', function () {
                    setStatus(comment.id, 'approved');
                }));
            }
            if (comment.status !== 'rejected') {
                actions.appendChild(actionButton('דחייה', 'btn small', function () {
                    setStatus(comment.id, 'rejected');
                }));
            }
            if (comment.status !== 'pending') {
                actions.appendChild(actionButton('החזרה להמתנה', 'btn small ghost', function () {
                    setStatus(comment.id, 'pending');
                }));
            }
            actions.appendChild(actionButton('מחיקה', 'btn small danger', function () {
                if (!window.confirm('למחוק את התגובה לצמיתות?')) return;
                api('/comments/' + comment.id, { method: 'DELETE' }).then(function () {
                    toast('התגובה נמחקה');
                    loadComments();
                }).catch(function (error) { toast(error.message, true); });
            }));
            if (comment.visitorId) {
                actions.appendChild(actionButton('חסימת המבקר', 'btn small ghost', function () {
                    if (!window.confirm('לחסום את המבקר? כל תגובותיו המאושרות יחזרו להמתנה.')) return;
                    api('/visitors/' + comment.visitorId + '/block', { method: 'POST', body: { blocked: true } })
                        .then(function () {
                            toast('המבקר נחסם');
                            loadComments();
                        }).catch(function (error) { toast(error.message, true); });
                }));
            }
            main.appendChild(actions);
        }

        card.appendChild(main);
        return card;
    }

    function actionButton(label, className, onClick) {
        var button = h('button', className, label);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    function setStatus(id, status) {
        api('/comments/' + id + '/status', { method: 'POST', body: { status: status } })
            .then(function () {
                toast(status === 'approved' ? 'התגובה אושרה' : status === 'rejected' ? 'התגובה נדחתה' : 'התגובה הוחזרה להמתנה');
                loadComments();
            })
            .catch(function (error) { toast(error.message, true); });
    }

    function loadComments() {
        var filters = state.comments;
        var params = new URLSearchParams({
            status: filters.status,
            limit: String(filters.limit),
            offset: String(filters.offset),
        });
        if (filters.site) params.set('site', filters.site);
        if (filters.q) params.set('q', filters.q);

        api('/comments?' + params.toString()).then(function (data) {
            filters.total = data.total;
            var list = clear($('#commentsList'));
            if (!data.comments.length) {
                list.appendChild(h('p', 'empty', 'אין תגובות שתואמות לסינון.'));
            } else {
                data.comments.forEach(function (comment) { list.appendChild(commentCard(comment)); });
            }
            $$('[data-count]').forEach(function (pill) {
                pill.textContent = String(data.counts[pill.dataset.count] || 0);
            });
            updatePendingBadge(data.counts.pending || 0);

            var from = data.total ? filters.offset + 1 : 0;
            var to = Math.min(filters.offset + filters.limit, data.total);
            $('#pageInfo').textContent = from + '–' + to + ' מתוך ' + data.total;
            $('#prevPage').disabled = filters.offset === 0;
            $('#nextPage').disabled = to >= data.total;
            renderBulkBar();
        }).catch(function (error) { toast(error.message, true); });
    }

    function renderBulkBar() {
        var bar = $('#bulkBar');
        bar.hidden = state.selection.size === 0;
        $('#bulkCount').textContent = state.selection.size + ' נבחרו';
    }

    $$('#statusTabs .tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            $$('#statusTabs .tab').forEach(function (other) { other.classList.remove('is-active'); });
            tab.classList.add('is-active');
            state.comments.status = tab.dataset.status;
            state.comments.offset = 0;
            state.selection.clear();
            loadComments();
        });
    });

    $('#siteFilter').addEventListener('change', function (event) {
        state.comments.site = event.target.value;
        state.comments.offset = 0;
        updateExportLink();
        loadComments();
    });

    var searchTimer = null;
    $('#searchInput').addEventListener('input', function (event) {
        clearTimeout(searchTimer);
        var value = event.target.value;
        searchTimer = setTimeout(function () {
            state.comments.q = value;
            state.comments.offset = 0;
            loadComments();
        }, 300);
    });

    $('#prevPage').addEventListener('click', function () {
        state.comments.offset = Math.max(0, state.comments.offset - state.comments.limit);
        loadComments();
    });

    $('#nextPage').addEventListener('click', function () {
        state.comments.offset += state.comments.limit;
        loadComments();
    });

    $$('[data-bulk]').forEach(function (button) {
        button.addEventListener('click', function () {
            var action = button.dataset.bulk;
            if (action === 'delete' && !window.confirm('למחוק את התגובות שנבחרו לצמיתות?')) return;
            api('/comments/bulk', {
                method: 'POST',
                body: { ids: Array.from(state.selection), action: action },
            }).then(function (data) {
                toast(data.affected + ' תגובות עודכנו');
                state.selection.clear();
                loadComments();
            }).catch(function (error) { toast(error.message, true); });
        });
    });

    $('#clearSelection').addEventListener('click', function () {
        state.selection.clear();
        loadComments();
    });

    function updateExportLink() {
        var link = $('#exportLink');
        link.href = '/admin/api/comments/export' + (state.comments.site ? '?site=' + state.comments.site : '');
    }

    /* ---- likes ---- */

    function loadLikes() {
        api('/likes' + (state.comments.site ? '?site=' + state.comments.site : '')).then(function (data) {
            renderInto($('#likesTable'), data.pages.length ? table(
                ['אתר', 'דף', 'לייקים', 'לייק אחרון'],
                data.pages.map(function (row) {
                    var page = row.page_url ? h('a', null, row.page_title || row.page_path) : h('span', null, row.page_path);
                    if (row.page_url) {
                        page.href = row.page_url;
                        page.target = '_blank';
                        page.rel = 'noopener noreferrer';
                    }
                    return [row.site_name, page, { text: String(row.likes), className: 'num' }, formatDate(row.last_at)];
                }),
            ) : null, 'עדיין אין לייקים.');
        }).catch(function (error) { toast(error.message, true); });
    }

    /* ---- sites ---- */

    function loadSites() {
        return api('/sites').then(function (data) {
            state.sites = data.sites;
            var select = $('#siteFilter');
            var current = select.value;
            clear(select);
            var all = h('option', null, 'כל האתרים');
            all.value = '';
            select.appendChild(all);
            data.sites.forEach(function (site) {
                var option = h('option', null, site.name);
                option.value = String(site.id);
                select.appendChild(option);
            });
            select.value = current;
            updateExportLink();
        });
    }

    function snippetFor(site) {
        var origin = window.location.origin;
        return '<script src="' + origin + '/embed.js" data-site="' + site.key + '" defer><\/script>\n'
            + '<div data-tells="likes"></div>\n'
            + '<div data-tells="comments"></div>';
    }

    function renderSites() {
        loadSites().then(function () {
            var list = clear($('#sitesList'));
            if (!state.sites.length) {
                list.appendChild(h('p', 'empty', 'עדיין לא הוספתם אתר. לחצו על "אתר חדש" כדי להתחיל.'));
                return;
            }
            state.sites.forEach(function (site) {
                var card = h('div', 'site-card');
                card.appendChild(h('h3', null, site.name));

                var stats = h('div', 'stats');
                stats.appendChild(h('span', null, site.moderation === 'pre' ? 'אישור לפני פרסום' : 'פרסום מיידי'));
                stats.appendChild(h('span', null, site.allowAnonymous ? 'אנונימי מותר' : 'אימייל בלבד'));
                if (!site.active) stats.appendChild(h('span', null, 'כבוי'));
                card.appendChild(stats);

                card.appendChild(h('div', 'muted', site.origins.length ? site.origins.join(' · ') : 'כל הדומיינים מורשים'));

                var snippet = h('div', 'snippet', snippetFor(site));
                card.appendChild(snippet);

                var actions = h('div', 'site-actions');
                actions.appendChild(actionButton('העתקת קוד ההטמעה', 'btn small primary', function () {
                    navigator.clipboard.writeText(snippetFor(site))
                        .then(function () { toast('קוד ההטמעה הועתק'); })
                        .catch(function () { toast('ההעתקה נכשלה — סמנו והעתיקו ידנית', true); });
                }));
                actions.appendChild(actionButton('עריכה', 'btn small ghost', function () { openSiteDialog(site); }));
                actions.appendChild(actionButton(site.active ? 'השבתה' : 'הפעלה', 'btn small ghost', function () {
                    api('/sites/' + site.id, { method: 'PATCH', body: { active: !site.active } })
                        .then(function () {
                            toast('הסטטוס עודכן');
                            renderSites();
                        }).catch(function (error) { toast(error.message, true); });
                }));
                actions.appendChild(actionButton('החלפת מפתח', 'btn small ghost', function () {
                    if (!window.confirm('החלפת המפתח תנתק את כל הרכיבים שמשתמשים במפתח הישן. להמשיך?')) return;
                    api('/sites/' + site.id + '/rotate-key', { method: 'POST' })
                        .then(function () {
                            toast('נוצר מפתח חדש — עדכנו את קוד ההטמעה');
                            renderSites();
                        }).catch(function (error) { toast(error.message, true); });
                }));
                actions.appendChild(actionButton('מחיקה', 'btn small danger', function () {
                    if (!window.confirm('מחיקת האתר תמחק גם את כל התגובות והלייקים שלו. להמשיך?')) return;
                    api('/sites/' + site.id, { method: 'DELETE' })
                        .then(function () {
                            toast('האתר נמחק');
                            renderSites();
                        }).catch(function (error) { toast(error.message, true); });
                }));
                card.appendChild(actions);
                list.appendChild(card);
            });
        }).catch(function (error) { toast(error.message, true); });
    }

    var dialog = $('#siteDialog');

    function openSiteDialog(site) {
        state.editingSite = site || null;
        $('#siteDialogTitle').textContent = site ? 'עריכת אתר' : 'אתר חדש';
        $('#siteName').value = site ? site.name : '';
        $('#siteOrigins').value = site ? site.origins.join('\n') : '';
        $('#siteModeration').value = site ? site.moderation : 'pre';
        $('#siteLocale').value = site ? site.locale : 'he';
        $('#siteAnonymous').checked = site ? site.allowAnonymous : true;
        $('#siteComments').checked = site ? site.commentsOn : true;
        $('#siteLikes').checked = site ? site.likesOn : true;
        $('#siteError').hidden = true;
        dialog.showModal();
    }

    $('#newSite').addEventListener('click', function () { openSiteDialog(null); });
    $('#siteCancel').addEventListener('click', function () { dialog.close(); });

    $('#siteForm').addEventListener('submit', function (event) {
        event.preventDefault();
        var payload = {
            name: $('#siteName').value,
            origins: $('#siteOrigins').value,
            moderation: $('#siteModeration').value,
            locale: $('#siteLocale').value,
            allowAnonymous: $('#siteAnonymous').checked,
            commentsOn: $('#siteComments').checked,
            likesOn: $('#siteLikes').checked,
        };
        var request = state.editingSite
            ? api('/sites/' + state.editingSite.id, { method: 'PATCH', body: payload })
            : api('/sites', { method: 'POST', body: payload });

        request.then(function () {
            dialog.close();
            toast(state.editingSite ? 'האתר עודכן' : 'האתר נוסף — העתיקו את קוד ההטמעה');
            renderSites();
        }).catch(function (error) {
            var node = $('#siteError');
            node.textContent = error.message;
            node.hidden = false;
        });
    });

    /* ---- visitors ---- */

    function loadVisitors() {
        var query = $('#visitorSearch').value.trim();
        api('/visitors' + (query ? '?q=' + encodeURIComponent(query) : '')).then(function (data) {
            renderInto($('#visitorsTable'), data.visitors.length ? table(
                ['אתר', 'זהות', 'סוג', 'תגובות', 'לייקים', 'נראה לאחרונה', ''],
                data.visitors.map(function (visitor) {
                    var action = actionButton(visitor.blocked ? 'שחרור חסימה' : 'חסימה',
                        'btn small ' + (visitor.blocked ? 'ghost' : 'danger'), function () {
                            api('/visitors/' + visitor.id + '/block', {
                                method: 'POST',
                                body: { blocked: !visitor.blocked },
                            }).then(function () {
                                toast(visitor.blocked ? 'החסימה הוסרה' : 'המבקר נחסם');
                                loadVisitors();
                            }).catch(function (error) { toast(error.message, true); });
                        });
                    return [
                        visitor.siteName,
                        visitor.email || visitor.name,
                        visitor.kind === 'email' ? 'אימייל' : 'אנונימי',
                        { text: String(visitor.comments), className: 'num' },
                        { text: String(visitor.likes), className: 'num' },
                        formatDate(visitor.lastSeenAt),
                        action,
                    ];
                }),
            ) : null, 'עדיין אין מבקרים רשומים.');
        }).catch(function (error) { toast(error.message, true); });
    }

    var visitorTimer = null;
    $('#visitorSearch').addEventListener('input', function () {
        clearTimeout(visitorTimer);
        visitorTimer = setTimeout(loadVisitors, 300);
    });

    /* ---- settings ---- */

    function loadSettings() {
        api('/settings').then(function (data) {
            $('#blocklist').value = data.blocklist.join('\n');
            renderInto($('#settingsInfo'), table(['הגדרה', 'מצב'], [
                ['בדיקת שרת דואר (DNS) בהרשמה', data.emailDnsCheck ? 'פעילה' : 'כבויה'],
                ['חסימת כתובות אימייל זמניות', data.blockDisposableEmail ? 'פעילה' : 'כבויה'],
                ['אורך תגובה מרבי', String(data.maxCommentLength) + ' תווים'],
            ]));
        }).catch(function (error) { toast(error.message, true); });

        api('/audit?limit=30').then(function (data) {
            renderInto($('#auditTable'), data.entries.length ? table(
                ['מתי', 'פעולה', 'ישות', 'פרטים'],
                data.entries.map(function (entry) {
                    return [formatDate(entry.created_at), entry.action, entry.entity + (entry.entity_id ? ' #' + entry.entity_id : ''), entry.details || ''];
                }),
            ) : null, 'היומן ריק.');
        }).catch(function () { /* the log is a nicety, not a blocker */ });
    }

    $('#saveBlocklist').addEventListener('click', function () {
        api('/settings', { method: 'PATCH', body: { blocklist: $('#blocklist').value } })
            .then(function () { toast('רשימת המילים נשמרה'); })
            .catch(function (error) { toast(error.message, true); });
    });

    $('#passwordForm').addEventListener('submit', function (event) {
        event.preventDefault();
        api('/password', {
            method: 'POST',
            body: { currentPassword: $('#currentPassword').value, newPassword: $('#newPassword').value },
        }).then(function () {
            toast('הסיסמה עודכנה — התחברו מחדש');
            showLogin();
        }).catch(function (error) { toast(error.message, true); });
    });

    /* ---- theme ---- */

    var storedTheme = null;
    try { storedTheme = window.localStorage.getItem('tells.admin.theme'); } catch (error) { /* private mode */ }
    if (storedTheme) document.documentElement.setAttribute('data-theme', storedTheme);

    $('#themeToggle').addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var next = current ? (current === 'dark' ? 'light' : 'dark') : (prefersDark ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', next);
        try { window.localStorage.setItem('tells.admin.theme', next); } catch (error) { /* private mode */ }
    });

    /* ---- boot ---- */

    api('/session').then(function (data) {
        if (data.authenticated) showApp();
        else showLogin();
    }).catch(showLogin);
})();
