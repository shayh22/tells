/* Accessibility controls: text size, contrast, greyscale, link underlines,
   a plain reading font, and motion. Every setting is stored under one key and
   re-applied before paint by the inline snippet in each page's <head>, so a
   reader's choices survive navigation between story pages. */
(function () {
    var KEY = 'tells.a11y';
    var STEPS = [90, 100, 110, 125, 140, 160];
    var FLAGS = {
        contrast: 'a11y-contrast',
        grayscale: 'a11y-grayscale',
        underline: 'a11y-underline',
        readable: 'a11y-readable',
        motion: 'a11y-no-motion'
    };
    var root = document.documentElement;
    var state = window.__a11yState || { size: 100 };

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }

    function apply() {
        root.style.fontSize = state.size === 100 ? '' : state.size + '%';
        for (var k in FLAGS) root.classList.toggle(FLAGS[k], !!state[k]);
        paint();
    }

    function paint() {
        var out = document.getElementById('a11ySize');
        if (out) out.textContent = state.size + '%';
        Array.prototype.forEach.call(
            document.querySelectorAll('[data-a11y]'),
            function (el) {
                var k = el.getAttribute('data-a11y');
                if (FLAGS[k]) el.setAttribute('aria-pressed', String(!!state[k]));
            }
        );
        var down = document.querySelectorAll('[data-a11y="font-down"]');
        var up = document.querySelectorAll('[data-a11y="font-up"]');
        Array.prototype.forEach.call(down, function (b) { b.disabled = state.size <= STEPS[0]; });
        Array.prototype.forEach.call(up, function (b) { b.disabled = state.size >= STEPS[STEPS.length - 1]; });
    }

    function step(dir) {
        var i = STEPS.indexOf(state.size);
        if (i < 0) i = 1;
        i = Math.min(STEPS.length - 1, Math.max(0, i + dir));
        state.size = STEPS[i];
    }

    document.addEventListener('click', function (ev) {
        var el = ev.target.closest ? ev.target.closest('[data-a11y]') : null;
        if (!el) return;
        var k = el.getAttribute('data-a11y');
        if (k === 'font-up') step(1);
        else if (k === 'font-down') step(-1);
        else if (k === 'reset') state = { size: 100 };
        else if (FLAGS[k]) state[k] = !state[k];
        else return;
        save();
        apply();
    });

    /* ---- the drawer ---- */
    var panel = document.getElementById('a11yPanel');
    var toggle = document.getElementById('a11yToggle');
    var scrim = document.getElementById('a11yScrim');
    var lastFocus = null;

    function focusable() {
        return Array.prototype.filter.call(
            panel.querySelectorAll('button, [href], input, select, textarea'),
            function (el) { return !el.disabled && el.offsetParent !== null; }
        );
    }

    function open() {
        lastFocus = document.activeElement;
        panel.classList.add('open');
        scrim.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        var f = focusable();
        if (f.length) f[0].focus();
    }

    function close() {
        panel.classList.remove('open');
        scrim.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    if (panel && toggle && scrim) {
        toggle.addEventListener('click', function () {
            panel.classList.contains('open') ? close() : open();
        });
        scrim.addEventListener('click', close);
        var closeBtn = document.getElementById('a11yClose');
        if (closeBtn) closeBtn.addEventListener('click', close);

        document.addEventListener('keydown', function (ev) {
            if (!panel.classList.contains('open')) return;
            if (ev.key === 'Escape') { close(); return; }
            if (ev.key !== 'Tab') return;
            /* keep Tab inside the drawer while it is open */
            var f = focusable();
            if (!f.length) return;
            var first = f[0], last = f[f.length - 1];
            if (ev.shiftKey && document.activeElement === first) {
                ev.preventDefault(); last.focus();
            } else if (!ev.shiftKey && document.activeElement === last) {
                ev.preventDefault(); first.focus();
            }
        });
    }

    apply();
})();
