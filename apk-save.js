// Saves APK downloads from inside the app, through the folder picker.
(function () {
  var C = window.Capacitor;
  var NATIVE = !!(C && C.isNativePlatform && C.isNativePlatform());
  C = C || { registerPlugin: function () { return null; } };
  var P = NATIVE ? C.registerPlugin('FolderAccess') : { saveAs: function (o) { return new Promise(function (ok) { var bin = atob(o.data), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: o.mime })); a.download = o.name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); ok(); }); } };

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
  function crc32(u) { var t = crc32.t; if (!t) { t = crc32.t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } } var r = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) r = t[(r ^ u[i]) & 255] ^ (r >>> 8); return (r ^ 0xFFFFFFFF) >>> 0; }
  async function makeZip(folder, name, blob) {
    var data = new Uint8Array(await blob.arrayBuffer()), enc = new TextEncoder(), p = enc.encode(folder + '/' + name), d = enc.encode(folder + '/'), parts = [], cd = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    function add(pb, bytes, c, dir) {
      var lh = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(c), u32(bytes.length), u32(bytes.length), u16(pb.length), u16(0)));
      var ch = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(c), u32(bytes.length), u32(bytes.length), u16(pb.length), u16(0), u16(0), u16(0), u16(0), u32(dir ? 0x10 : 0), u32(off)));
      parts.push(lh, pb, bytes); cd.push(ch, pb); off += lh.length + pb.length + bytes.length;
    }
    add(d, new Uint8Array(0), 0, true); add(p, data, crc32(data), false);
    var cl = 0; cd.forEach(function (x) { cl += x.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(2), u16(2), u32(cl), u32(off), u16(0)));
    return new Blob(parts.concat(cd, [end]), { type: 'application/zip' });
  }
  async function save(href, repo, tag, name, zip) {
    var h = { Accept: 'application/vnd.github+json' }, t = tk();
    if (t) h.Authorization = 'Bearer ' + t;
    try {
      toast('Downloading ' + name + '...');
      var rel = await (await fetch('https://api.github.com/repos/' + repo + '/releases/tags/' + encodeURIComponent(tag), { headers: h })).json();
      var as = (rel.assets || []).find(function (x) { return x.name === name; });
      if (!as && NATIVE) throw new Error('APK not found');
      h.Accept = 'application/octet-stream';
      var r = NATIVE ? await fetch('https://api.github.com/repos/' + repo + '/releases/assets/' + as.id, { headers: h }) : await fetch('/api/dl?repo=' + encodeURIComponent(repo) + '&tag=' + encodeURIComponent(tag) + '&name=' + encodeURIComponent(name), { headers: t ? { 'x-gh': t } : {} });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var blob = await r.blob();
      if (zip) {
        try {
          var base = name.replace(/\.apk$/i, ''), z = { folder: function () { return { file: function () {} }; }, generateAsync: function () { return makeZip(base, name, blob); } };
          z.folder(base).file(name, blob);
          var zb = await z.generateAsync({ type: 'blob' });
          await P.saveAs({ name: base + '.zip', data: await b64(zb), base64: true, mime: 'application/zip' });
          toast('Saved ' + base + '.zip');
          return;
        } catch (ze) {
          if (String(ze && ze.message || ze) === 'cancelled') return;
          alert('ZIP step failed: ' + String(ze && ze.message || ze));
        }
      }
      await P.saveAs({ name: name, data: await b64(blob), base64: true, mime: 'application/vnd.android.package-archive' });
      toast('Saved ' + name);
    } catch (err) {
      if (String(err && err.message || err) === 'cancelled') return;
      alert('Download step failed: ' + String(err && err.message || err));
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
    save(a.href, m[1], decodeURIComponent(m[2]), decodeURIComponent(m[3]), true);
  }, true);
})();