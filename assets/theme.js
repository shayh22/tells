(function () {
    var root = document.documentElement;
    var btn = document.getElementById('themeToggle');
    var media = window.matchMedia('(prefers-color-scheme: dark)');

    function current() {
        var set = root.getAttribute('data-theme');
        return set === 'dark' || set === 'light'
            ? set
            : (media.matches ? 'dark' : 'light');
    }

    function sync() {
        var dark = current() === 'dark';
        btn.setAttribute('aria-pressed', String(dark));
        btn.title = dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה';
    }

    btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('tells.theme', next); } catch (e) {}
        sync();
    });

    /* while no explicit choice is stored the page keeps following the
       system, including a change made after load */
    media.addEventListener('change', function () {
        if (!root.getAttribute('data-theme')) sync();
    });

    sync();
})();
