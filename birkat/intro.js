/* The logo greets the visitor full-screen, then flies into its place in the
   header. It plays once per browsing session, and never for a reader who
   asked for less motion — through the system setting or the accessibility
   drawer. Whatever happens, a timer takes the overlay down, so a failed
   animation can never leave the page covered. */
(function () {
    var root = document.documentElement;
    if (root.classList.contains('a11y-no-motion')) return;
    if (!document.body || !document.body.animate) return;
    try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (sessionStorage.getItem('birkat.intro')) return;
        sessionStorage.setItem('birkat.intro', '1');
    } catch (e) { /* private mode: playing it once more is harmless */ }

    var overlay = document.createElement('div');
    overlay.className = 'intro';
    overlay.setAttribute('aria-hidden', 'true');

    var bg = document.createElement('div');
    bg.className = 'intro-bg';

    var img = document.createElement('img');
    img.src = 'logo.webp';
    img.alt = '';
    img.decoding = 'sync';

    overlay.appendChild(bg);
    overlay.appendChild(img);
    document.body.appendChild(overlay);
    root.classList.add('intro-playing');

    var done = false;
    var timers = [];

    function finish() {
        if (done) return;
        done = true;
        timers.forEach(clearTimeout);
        root.classList.remove('intro-playing');
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        window.removeEventListener('keydown', finish, true);
        window.removeEventListener('wheel', finish, true);
        window.removeEventListener('touchstart', finish, true);
    }

    function fly() {
        var target = document.querySelector('.brand img');
        if (!target || done) { finish(); return; }
        var from = img.getBoundingClientRect();
        var to = target.getBoundingClientRect();
        if (!from.width || !to.width) { finish(); return; }
        var scale = to.width / from.width;
        var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
        var move = img.animate([
            { transform: 'none' },
            { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + scale + ')' }
        ], { duration: 820, easing: 'cubic-bezier(.62,.02,.24,1)', fill: 'forwards' });
        bg.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 820, easing: 'ease-in', fill: 'forwards' });
        move.addEventListener('finish', finish);
    }

    img.animate([
        { opacity: 0, transform: 'scale(0.88)' },
        { opacity: 1, transform: 'none' }
    ], { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });

    timers.push(setTimeout(fly, 640));
    timers.push(setTimeout(finish, 2600));

    /* any deliberate move by the reader cuts it short */
    window.addEventListener('keydown', finish, true);
    window.addEventListener('wheel', finish, true);
    window.addEventListener('touchstart', finish, true);
    overlay.addEventListener('click', finish);
})();
