/* Multi Bundle - Backups tab: small project cards, pick files, save them as one ZIP or as separate raw files. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmtSize(n) {
    n = n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function safeName(s) { return String(s || 'project').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project'; }
  function baseName(p) { return String(p).split('/').pop(); }
  function dirName(p) { var i = String(p).lastIndexOf('/'); return i < 0 ? '' : String(p).slice(0, i + 1); }
  function fileBlob(f) {
    if (typeof Blob !== 'undefined' && f.blob instanceof Blob) return f.blob;
    return new Blob([f.text == null ? '' : f.text], { type: f.type || 'text/plain' });
  }
  // Raw files keep their own names (index.html, style.css ...). Same name twice? Add the folder so nothing is overwritten.
  function uniqueNames(list) {
    var count = {};
    list.forEach(function (f) { var b = baseName(f.path); count[b] = (count[b] || 0) + 1; });
    var used = {};
    return list.map(function (f) {
      var b = baseName(f.path);
      var n = count[b] > 1 ? String(f.path).replace(/\//g, '_') : b;
      var base = n, i = 2;
      while (used[n]) {
        var dot = base.lastIndexOf('.');
        n = dot > 0 ? base.slice(0, dot) + '_' + i + base.slice(dot) : base + '_' + i;
        i++;
      }
      used[n] = 1;
      return n;
    });
  }
  function sortedFiles(p) {
    return (p.files || []).slice().sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
  }
  function totalSize(p) { return (p.files || []).reduce(function (a, f) { return a + (f.size || 0); }, 0); }

  var cache = [];
  var state = { pid: null, sel: {}, busy: false };

  async function loadProjects() {
    try { cache = (typeof dbGetAll === 'function') ? await dbGetAll() : []; } catch (e) { cache = []; }
    return cache;
  }

  var FOLDER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  function listHtml(list) {
    if (!list.length) return '<div class="bk-empty">No saved projects yet. Import a project in the Projects tab and it will show up here.</div>';
    return '<div class="bk-grid">' + list.map(function (p) {
      var n = (p.files || []).length;
      return '<button class="bk-proj" data-id="' + esc(p.id) + '"><span class="bk-ic">' + FOLDER + '</span><b>' + esc(p.name || 'Untitled') + '</b><small>' + n + ' file' + (n === 1 ? '' : 's') + ' \u00b7 ' + fmtSize(totalSize(p)) + '</small></button>';
    }).join('') + '</div>' +
    '<button class="bk-link" id="bkBundle">Make a TXT bundle instead \u2192</button>';
  }

  function detailHtml(p) {
    var fl = sortedFiles(p);
    var rows = fl.map(function (f) {
      return '<label class="bk-file"><input type="checkbox" data-p="' + esc(f.path) + '"' + (state.sel[f.path] ? ' checked' : '') + '>' +
        '<span class="bk-fn"><b>' + esc(baseName(f.path)) + '</b>' + (dirName(f.path) ? '<i>' + esc(dirName(f.path)) + '</i>' : '') + '</span><em>' + fmtSize(f.size) + '</em></label>';
    }).join('') || '<div class="bk-empty">This project has no files.</div>';
    return '<button class="bk-back" id="bkBack">\u2039 All projects</button>' +
      '<section class="card"><div class="bk-head"><div><label class="eyebrow">PROJECT</label><h2>' + esc(p.name || 'Untitled') + '</h2></div><span class="pill">' + fl.length + ' file' + (fl.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="bk-title">EXPORT <small>Pick the files you want to take out</small></div>' +
      '<div class="bk-bar"><label class="bk-all"><input type="checkbox" id="bkAll"><span>Select all</span></label><span class="bk-count" id="bkCount">0 selected</span></div>' +
      '<div class="bk-files">' + rows + '</div>' +
      '<div class="bk-actions">' +
  '<button class="btn primary" id="bkZip">Make ZIP</button>' +
  '<button class="btn secondary" id="bkRaw">Raw files</button>' +
  '<button class="btn secondary" id="bkDrive">Google Drive</button>' +
  '<button class="btn secondary" id="bkDel" style="color:#ff8a8a;border-color:#5a2430;background:#25131a">Delete</button>' +
'</div>' +
'<div class="bk-hint">ZIP puts everything in one file. Raw files saves each file on its own with its own name. Delete removes the selected files from the project (a snapshot is saved first).</div></section>';
  }

  function selectedFiles(p) { return sortedFiles(p).filter(function (f) { return state.sel[f.path]; }); }

  function updateBar(p) {
    var fl = sortedFiles(p), n = selectedFiles(p).length;
    var c = $('bkCount'); if (c) c.textContent = n + ' selected';
    var a = $('bkAll');
    if (a) { a.checked = n > 0 && n === fl.length; a.indeterminate = n > 0 && n < fl.length; }
    ['bkZip', 'bkRaw', 'bkDrive', 'bkDel'].forEach(function (id) { var b = $(id); if (b) b.disabled = !n || state.busy; });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
  }

  async function makeZip(p, list) {
    if (!window.JSZip) throw new Error('The ZIP tool did not load. Check your internet and refresh.');
    var zip = new JSZip();
    list.forEach(function (f) { zip.file(f.path, fileBlob(f)); });
    var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { name: safeName(p.name) + '.zip', blob: blob };
  }

  async function runZip(p) {
    var list = selectedFiles(p); if (!list.length || state.busy) return;
    state.busy = true; updateBar(p); toast('Making your ZIP\u2026');
    try {
      var z = await makeZip(p, list);
      download(z.blob, z.name);
      toast('ZIP ready: ' + z.name + ' (' + list.length + ' file' + (list.length === 1 ? '' : 's') + ')', 'success');
    } catch (e) { toast(e.message || 'Could not make the ZIP', 'error'); }
    state.busy = false; updateBar(p);
  }

  var driveTok = null, driveTokExp = 0;
  async function getDriveToken() {
    if (driveTok && Date.now() < driveTokExp) return driveTok;
    var auth = firebase.auth(), cu = auth.currentUser;
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    if (cu && cu.email) provider.setCustomParameters({ login_hint: cu.email });
    var res;
    try {
      var linked = !!(cu && cu.providerData && cu.providerData.some(function (x) { return x.providerId === 'google.com'; }));
      res = await (cu ? (linked ? cu.reauthenticateWithPopup(provider) : cu.linkWithPopup(provider)) : auth.signInWithPopup(provider));
    } catch (e) {
      if (e && e.code === 'auth/credential-already-in-use' && e.credential && e.credential.accessToken) {
        driveTok = e.credential.accessToken; driveTokExp = Date.now() + 50 * 60 * 1000; return driveTok;
      }
      throw e;
    }
    driveTok = res.credential && res.credential.accessToken;
    if (!driveTok) throw new Error('Google did not give Drive access');
    driveTokExp = Date.now() + 50 * 60 * 1000;
    return driveTok;
  }

  async function runDrive(p) {
    var list = selectedFiles(p); if (!list.length || state.busy) return;
    state.busy = true; updateBar(p);
    try {
      toast('Connecting to Google Drive\u2026');
      var tok = await getDriveToken();
      toast('Uploading to Google Drive\u2026');
      var z = await makeZip(p, list);
      var b = 'mbdrive' + Date.now();
      var body = new Blob([
        '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify({ name: z.name }),
        '\r\n--' + b + '\r\nContent-Type: application/zip\r\n\r\n',
        z.blob,
        '\r\n--' + b + '--'
      ]);
      var r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + b },
        body: body
      });
      if (r.status === 401) { driveTok = null; driveTokExp = 0; }
      if (!r.ok) { var em = ''; try { var ej = await r.json(); em = (ej.error && ej.error.message) || ''; } catch (x) {} throw new Error('Drive ' + r.status + ': ' + em); }
      var d = await r.json();
      toast('Saved to Google Drive: ' + d.name, 'success');
      window.open(d.webViewLink || 'https://drive.google.com/drive/my-drive', '_blank');
    } catch (e) {
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) toast('Google Drive cancelled');
      else toast((e && e.message) || 'Could not save to Google Drive', 'error');
    }
    state.busy = false; updateBar(p);
  }

  async function driveFail(r) {
    if (r.status === 401) { driveTok = null; driveTokExp = 0; }
    var m = '';
    try { var j = await r.json(); m = (j.error && j.error.message) || ''; } catch (x) {}
    return new Error('Drive ' + r.status + ': ' + m);
  }

  async function runDriveSingles(p) {
    var list = selectedFiles(p); if (!list.length || state.busy) return;
    state.busy = true; updateBar(p);
    try {
      toast('Connecting to Google Drive\u2026');
      var tok = await getDriveToken();
      var fr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName(p.name), mimeType: 'application/vnd.google-apps.folder' })
      });
      if (!fr.ok) throw await driveFail(fr);
      var folder = await fr.json();
      var names = uniqueNames(list);
      for (var i = 0; i < list.length; i++) {
        toast('Uploading ' + (i + 1) + ' of ' + list.length + '\u2026');
        var blob = fileBlob(list[i]);
        var b = 'mbdrive' + Date.now() + i;
        var body = new Blob([
          '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
          JSON.stringify({ name: names[i], parents: [folder.id] }),
          '\r\n--' + b + '\r\nContent-Type: ' + (blob.type || 'application/octet-stream') + '\r\n\r\n',
          blob,
          '\r\n--' + b + '--'
        ]);
        var r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'multipart/related; boundary=' + b },
          body: body
        });
        if (!r.ok) throw await driveFail(r);
      }
      toast('Saved ' + list.length + ' file' + (list.length === 1 ? '' : 's') + ' to Drive folder ' + safeName(p.name), 'success');
      window.open(folder.webViewLink || 'https://drive.google.com/drive/my-drive', '_blank');
    } catch (e) {
      if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) toast('Google Drive cancelled');
      else toast((e && e.message) || 'Could not save to Google Drive', 'error');
    }
    state.busy = false; updateBar(p);
  }

  function driveChooser(p) {
    var old = document.getElementById('bkDrvPick'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'bkDrvPick';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div style="width:100%;max-width:320px;background:#17181c;border:1px solid #25262c;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;color:#fff">' +
      '<div style="font-weight:800;font-size:16px">Save to Google Drive</div>' +
      '<div style="font-size:12px;opacity:.7">Save ZIP uploads one ZIP file. Singles makes a folder named ' + esc(safeName(p.name)) + ' with your files inside.</div>' +
      '<div style="display:flex;gap:8px"><button class="btn primary" id="bkDrvZip" style="flex:1">Save ZIP</button><button class="btn secondary" id="bkDrvSingles" style="flex:1">Singles</button></div>' +
      '<button class="btn secondary" id="bkDrvCancel">Cancel</button></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.onclick = function (e) { if (e.target === ov) close(); };
    document.getElementById('bkDrvCancel').onclick = close;
    document.getElementById('bkDrvZip').onclick = function () { close(); runDrive(p); };
    document.getElementById('bkDrvSingles').onclick = function () { close(); runDriveSingles(p); };
  }

  async function runRaw(p) {
    var list = selectedFiles(p); if (!list.length || state.busy) return;
    state.busy = true; updateBar(p);
    var names = uniqueNames(list);
    toast('Saving ' + list.length + ' file' + (list.length === 1 ? '' : 's') + '\u2026');
    try {
      for (var i = 0; i < list.length; i++) { download(fileBlob(list[i]), names[i]); await sleep(350); }
      toast('Saved ' + list.length + ' file' + (list.length === 1 ? '' : 's'), 'success');
    } catch (e) { toast('Could not save the files', 'error'); }
    state.busy = false; updateBar(p);
  }

  async function runDelete(p) {
    var list = selectedFiles(p);
    if (!list.length || state.busy) return;

    var msg = 'Delete ' + list.length + ' file' + (list.length === 1 ? '' : 's') +
      ' from "' + (p.name || 'this project') + '"?\n\nA backup snapshot is saved first so you can restore later.';
    var ok = false;
    if (typeof window.showConfirm === 'function') {
      ok = await window.showConfirm(msg, { title: 'Delete files', confirmText: 'Delete', cancelText: 'Keep' });
    } else {
      ok = window.confirm(msg);
    }
    if (!ok) return;

    state.busy = true;
    updateBar(p);
    toast('Deleting…');

    try {
      // Save a snapshot first
      p.snapshots = p.snapshots || [];
      p.snapshots.unshift({
        ts: Date.now(),
        label: 'Before delete (' + list.length + ' file' + (list.length === 1 ? '' : 's') + ')',
        files: (p.files || []).map(function (f) {
          return { path: f.path, name: f.name, size: f.size, type: f.type, text: f.text, blob: f.blob };
        })
      });
      if (p.snapshots.length > 20) p.snapshots.length = 20;

      // Remove the selected files
      var remove = {};
      list.forEach(function (f) { remove[f.path] = true; });
      p.files = (p.files || []).filter(function (f) { return !remove[f.path]; });
      p.savedAt = Date.now();

      // Persist
      if (typeof dbUpsertProject === 'function') {
        await dbUpsertProject(p);
      } else if (typeof dbSetAll === 'function') {
        var all = await dbGetAll();
        var i = all.findIndex(function (x) { return x.id === p.id; });
        if (i >= 0) all[i] = p;
        await dbSetAll(all);
      }

      // Keep live project in sync
      if (typeof currentProjectId !== 'undefined' && currentProjectId === p.id && typeof files !== 'undefined') {
        files = p.files.slice();
        if (typeof populatePages === 'function') populatePages();
        if (typeof render === 'function') render();
      }

      // Refresh UI
      state.sel = {};
      toast('Deleted ' + list.length + ' file' + (list.length === 1 ? '' : 's'), 'success');
      openProject(p.id);
    } catch (e) {
      toast((e && e.message) || 'Could not delete the files', 'error');
    }

    state.busy = false;
    updateBar(p);
  }

  function showList() {
    state.pid = null; state.sel = {};
    var body = $('bkBody'); if (!body) return;
    body.innerHTML = listHtml(cache);
    body.querySelectorAll('.bk-proj').forEach(function (b) { b.onclick = function () { openProject(b.dataset.id); }; });
    var bn = $('bkBundle'); if (bn) bn.onclick = function () { if (typeof window.showTab === 'function') window.showTab('bundle'); };
  }

  function currentProject() { return cache.find(function (x) { return x.id === state.pid; }) || null; }

  function openProject(id) {
    state.pid = id; state.sel = {};
    var p = currentProject(); if (!p) { showList(); return; }
    var body = $('bkBody'); if (!body) return;
    body.innerHTML = detailHtml(p);
    $('bkBack').onclick = showList;
    body.querySelectorAll('.bk-file input').forEach(function (c) {
      c.onchange = function () { if (c.checked) state.sel[c.dataset.p] = true; else delete state.sel[c.dataset.p]; updateBar(p); };
    });
    $('bkAll').onchange = function () {
      var on = this.checked; state.sel = {};
      body.querySelectorAll('.bk-file input').forEach(function (c) { c.checked = on; if (on) state.sel[c.dataset.p] = true; });
      updateBar(p);
    };
    $('bkZip').onclick = function () { runZip(p); };
$('bkRaw').onclick = function () { runRaw(p); };
$('bkDrive').onclick = function () { driveChooser(p); };
$('bkDel').onclick = function () { runDelete(p); };
    updateBar(p);
    window.scrollTo && window.scrollTo(0, 0);
  }

  async function render() {
    if (!$('bkBody')) return;
    await loadProjects();
    if (state.pid && currentProject()) openProject(state.pid); else showList();
  }

  function build() {
    var page = $('backupsPage'); if (!page) return false;
    page.innerHTML = '<section class="card"><label class="eyebrow">BACKUPS</label><h1>Safe <span>Backups</span></h1><p>Tap a project to choose files, then save them as one ZIP or as separate files.</p></section><div id="bkBody"></div>';
    return true;
  }

  function injectCss() {
    if ($('bkStyle')) return;
    var st = document.createElement('style'); st.id = 'bkStyle';
    st.textContent = [
      '#bkBody{display:flex;flex-direction:column;gap:12px}',
      '.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
      '.bk-proj{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;background:#17181c;border:1px solid #25262c;border-radius:12px;padding:10px 11px;color:var(--text);cursor:pointer;min-width:0;font-family:inherit;transition:transform .14s ease,background .14s ease}',
      '.bk-proj:active{transform:scale(.97);background:#1d1e24}',
      '.bk-proj b{font-size:13px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bk-proj small{font-size:10.5px;color:var(--muted)}',
      '.bk-ic{width:24px;height:24px;border-radius:7px;background:#2f3a52;color:#cfe0ff;display:grid;place-items:center;margin-bottom:4px}',
      '.bk-link{background:none;border:0;color:#cfe0ff;font-size:12px;font-weight:700;text-align:left;padding:6px 2px;cursor:pointer;font-family:inherit}',
      '.bk-empty{color:var(--muted);font-size:12.5px;line-height:1.5;text-align:center;padding:22px 8px}',
      '.bk-back{align-self:flex-start;background:#1c1d22;border:1px solid var(--line);color:#e5e6ea;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease}',
      '.bk-back:active{transform:scale(.96)}',
      '.bk-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}',
      '.bk-head h2{margin:2px 0 0;font-size:17px;overflow-wrap:anywhere}',
      '.bk-title{font-size:10px;font-weight:800;letter-spacing:1.4px;color:var(--red);margin:6px 0 8px}',
      '.bk-title small{font-size:11px;font-weight:600;letter-spacing:0;color:var(--muted);margin-left:6px}',
      '.bk-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 2px}',
      '.bk-all{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;cursor:pointer}',
      '.bk-count{font-size:11px;color:var(--muted);font-weight:700}',
      '.bk-files{max-height:46vh;overflow-y:auto;border:1px solid #25262c;border-radius:12px;background:#101115}',
      '.bk-file{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #1f2026;cursor:pointer}',
      '.bk-file:last-child{border-bottom:0}',
      '.bk-file input,.bk-all input{width:17px;height:17px;flex-shrink:0;accent-color:#ff2d46}',
      '.bk-fn{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.bk-fn b{font-size:13px;overflow-wrap:anywhere}',
      '.bk-fn i{font-style:normal;font-size:10.5px;color:var(--muted);overflow-wrap:anywhere}',
      '.bk-file em{font-style:normal;font-size:10.5px;color:var(--muted);flex-shrink:0}',
      '.bk-actions{display:flex;gap:8px;margin-top:12px}',
      '.bk-actions .btn:disabled{opacity:.4}',
      '.bk-actions .btn{transition:transform .14s ease,opacity .14s ease}',
      '.bk-actions .btn:active{transform:scale(.96)}',
      '.bk-hint{font-size:11.5px;color:var(--muted);line-height:1.5;margin-top:10px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  if (!build()) return;
  injectCss();

  var origShow = window.showTab;
  window.showTab = function (name) {
    if (typeof origShow === 'function') origShow(name);
    if (name === 'backups') render();
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-tab="backups"]');
    if (el) setTimeout(render, 0);
  }, true);
  try { var nav = JSON.parse(localStorage.getItem('mb_nav') || 'null'); if (nav && nav.tab === 'backups') setTimeout(render, 300); } catch (e) {}

  window.__bk = { uniqueNames: uniqueNames, fmtSize: fmtSize, safeName: safeName, listHtml: listHtml, detailHtml: detailHtml, makeZip: makeZip, _state: state };
})();
