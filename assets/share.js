(function () {
    var btn = document.getElementById('shareBtn');
    if (!btn) return;

    var label = btn.querySelector('.share-label');
    var resting = label.textContent;
    var timer;

    function flash(msg) {
        clearTimeout(timer);
        label.textContent = msg;
        btn.classList.add('ok');
        timer = setTimeout(function () {
            label.textContent = resting;
            btn.classList.remove('ok');
        }, 2200);
    }

    /* Fallback for anything without the share sheet: put the address on the
       clipboard instead, so the button always does something useful. */
    function copyLink() {
        var url = location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
                flash('הקישור הועתק');
            }, legacy);
        } else {
            legacy();
        }
        function legacy() {
            var ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                flash('הקישור הועתק');
            } catch (e) {
                flash('העתיקו את הכתובת מהדפדפן');
            }
            document.body.removeChild(ta);
        }
    }

    btn.addEventListener('click', function () {
        if (navigator.share) {
            navigator.share({
                title: document.title,
                text: document.title,
                url: location.href
            }).catch(function (err) {
                /* dismissing the share sheet is a choice, not a failure */
                if (err && err.name !== 'AbortError') copyLink();
            });
        } else {
            copyLink();
        }
    });
})();
