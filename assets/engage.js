/* Keeps the embedded engagement widgets on the reader's chosen theme.
   The widgets follow the system preference by themselves, but this site has an
   explicit light/dark toggle, so their theme is pinned to the page's. */
(function () {
    var root = document.documentElement;

    function apply() {
        var theme = root.getAttribute('data-theme');
        var nodes = document.querySelectorAll('[data-tells]');
        for (var i = 0; i < nodes.length; i += 1) {
            if (theme === 'dark' || theme === 'light') nodes[i].setAttribute('data-theme', theme);
            else nodes[i].removeAttribute('data-theme');   /* back to following the system */
        }
    }

    apply();
    new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
})();
