(function () {
    var btn = document.getElementById('shareBtn');
    if (!btn) return;

    var toast = document.getElementById('shareToast');
    var timer;

    function flash(msg, good) {
        clearTimeout(timer);
        toast.textContent = msg;
        toast.classList.add('show');
        if (good) btn.classList.add('ok');
        timer = setTimeout(function () {
            toast.classList.remove('show');
            btn.classList.remove('ok');
        }, 2200);
    }

    /* Fallback for anything without the share sheet: put the address on the
       clipboard instead, so the button always does something useful. */
    function copyLink() {
        var url = location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
                flash('הקישור הועתק', true);
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
                flash('הקישור הועתק', true);
            } catch (e) {
                flash('העתיקו את הכתובת מהדפדפן', false);
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
