// Saves APK downloads from inside the app, through the folder picker.
(function () {
  var C = window.Capacitor;
  if (!(C && C.isNativePlatform && C.isNativePlatform())) return;
  var P = C.registerPlugin('FolderAccess');

  function tk() {
    try { return sessionStorage.getItem('mb_apk_tk') || localStorage.getItem('mb_apk_tk') || localStorage.getItem('mb_gh_active_token') || ''; } catch (e) { return ''; }
  }
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600);
  }
  function b64(blob) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { no(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function loadZip() {
    return new Promise(function (ok, no) {
      if (window.JSZip) return ok(window.JSZip);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload = function () { ok(window.JSZip); };
      s.onerror = function () { no(new Error('ZIP tool did not load')); };
      document.head.appendChild(s);
    });
  }
  function ask(cb) {
    var bs = 'width:100%;padding:14px;margin-top:8px;border:0;border-radius:10px;background:#f01424;color:#fff;font:700 15px system-ui';
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end';
    d.innerHTML = '<div style="width:100%;box-sizing:border-box;background:#1c1d21;color:#fff;padding:18px;border-radius:14px 14px 0 0;font:700 16px system-ui">Save as' +
      '<button data-z="0" style="' + bs + '">APK file</button>' +
      '<button data-z="1" style="' + bs + ';background:#2a2c31">ZIP (folder with the APK)</button></div>';
    d.onclick = function (e) {
      var z = e.target.getAttribute && e.target.getAttribute('data-z');
      if (z === null || z === undefined) { if (e.target === d) d.remove(); return; }
      d.remove(); cb(z === '1');
    };
    document.body.appendChild(d);
  }
  async function save(href, repo, tag, name, zip) {
    var h = { Accept: 'application/vnd.github+json' }, t = tk();
    if (t) h.Authorization = 'Bearer ' + t;
    try {
      toast('Downloading ' + name + '...');
      var rel = await (await fetch('https://api.github.com/repos/' + repo + '/releases/tags/' + encodeURIComponent(tag), { headers: h })).json();
      var as = (rel.assets || []).find(function (x) { return x.name === name; });
      if (!as) throw new Error('APK not found');
      h.Accept = 'application/octet-stream';
      var r = await fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + as.id, { headers: h });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var blob = await r.blob();
      if (zip) {
        try {
          var Z = await loadZip(), z = new Z(), base = name.replace(/\.apk$/i, '');
          z.folder(base).file(name, blob);
          var zb = await z.generateAsync({ type: 'blob' });
          await P.saveAs({ name: base + '.zip', data: await b64(zb), base64: true, mime: 'application/zip' });
          toast('Saved ' + base + '.zip');
          return;
        } catch (ze) {
          if (String(ze && ze.message || ze) === 'cancelled') return;
        }
      }
      await P.saveAs({ name: name, data: await b64(blob), base64: true, mime: 'application/vnd.android.package-archive' });
      toast('Saved ' + name);
    } catch (err) {
      if (String(err && err.message || err) === 'cancelled') return;
      toast('Could not save here. Opening browser.');
      window.open(href, '_blank');
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var m = /^https:\/\/github\.com\/([^\/]+\/[^\/]+)\/releases\/download\/([^\/]+)\/([^\/?#]+\.apk)$/i.exec(a.href);
    if (!m) return;
    e.preventDefault(); e.stopPropagation();
    ask(function (zip) { save(a.href, m[1], decodeURIComponent(m[2]), decodeURIComponent(m[3]), zip); });
  }, true);
})();