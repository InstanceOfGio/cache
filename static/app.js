/* Cache — il minimo indispensabile di JS. Tutto il resto lo fa htmx. */
(function () {
  'use strict';

  var sheet = function () {
    return document.getElementById('sheet');
  };

  window.closeSheet = function () {
    var s = sheet();
    if (s) s.innerHTML = '';
    document.body.style.overflow = '';
  };

  /* quantita nel foglio "Aggiungi" */
  window.stepQty = function (d) {
    var input = document.getElementById('qty-input');
    var view = document.getElementById('qty-view');
    if (!input || !view) return;
    var n = Math.max(1, (parseFloat(input.value) || 1) + d);
    input.value = String(n);
    view.textContent = String(n);
  };

  window.toggleTheme = function () {
    var dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('cache-theme', dark ? 'dark' : 'light');
    } catch (e) {}
  };

  /* copia negli appunti con fallback per i browser senza permesso */
  window.copyText = function (id, btn) {
    var el = document.getElementById(id);
    if (!el) return;
    var text = el.value !== undefined ? el.value : el.textContent;
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = 'Copiato ✓';
      setTimeout(function () {
        btn.textContent = old;
      }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () {
        el.select && el.select();
      });
    } else if (el.select) {
      el.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e) {}
    }
  };

  /* Esc chiude il foglio; blocca lo scroll del fondo mentre e aperto */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeSheet();
  });

  document.body.addEventListener('htmx:afterSwap', function (e) {
    if (e.target && e.target.id === 'sheet') {
      document.body.style.overflow = e.target.innerHTML.trim() ? 'hidden' : '';
      var focusable = e.target.querySelector('[autofocus]');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  });

  /* il server chiede un ricarico della lista dopo una modifica fatta dal foglio */
  document.body.addEventListener('cache:refresh', function (e) {
    var url = (e.detail && e.detail.url) || document.body.dataset.reload;
    var target = (e.detail && e.detail.target) || '#list';
    if (url && window.htmx && document.querySelector(target)) {
      window.htmx.ajax('GET', url, { target: target, swap: 'outerHTML' });
    }
  });
})();
