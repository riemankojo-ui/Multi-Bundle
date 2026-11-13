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
  var state = { pid: null, sel: {}, busy: false, currentDir: '', fileQ: '' };

  async function loadProjects() {
    try { cache = (typeof dbGetAll === 'function') ? await dbGetAll() : []; } catch (e) { cache = []; }
    return cache;
  }

  var FOLDER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  function listHtml(list) {
  var q = (($('bkSearch')||{}).value||'').trim();
  if (!list.length) {
    return '<div class="bk-empty">' + (q ? 'No projects match "' + esc(q) + '".' : 'No saved projects yet. Import a project in the Projects tab and it will show up here.') + '</div>';
  }
    return '<div class="bk-list">' + list.map(function (p) {
      var n = (p.files || []).length;
      return '<button class="bk-proj" data-id="' + esc(p.id) + '"><span class="bk-ic">' + FOLDER + '</span><span class="bk-info"><b>' + esc(p.name || 'Untitled') + '</b><small>' + n + ' file' + (n === 1 ? '' : 's') + '</small></span><span class="bk-chev"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span></button>';
    }).join('') + '</div>' +
    '<button class="bk-link" id="bkBundle">Make a TXT bundle instead \u2192</button>';
  }

  function detailHtml(p) {
  var fl = sortedFiles(p);
  if (state.fileQ) {
    fl = fl.filter(function(f) { return f.path.toLowerCase().indexOf(state.fileQ) > -1; });
  }
    function fileIcon(path) {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>';
}
    var rows = '';
if (state.fileQ) {
  fl.forEach(function(f) {
    var sel = state.sel[f.path];
    rows += '<button class="bk-frow' + (sel ? ' on' : '') + '" data-fp="' + esc(f.path) + '">' +
      (state.selecting ? '<span class="bk-chk">' + (sel ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#ff2d46" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</span>' : '') +
      fileIcon(f.path) +
      '<span class="bk-fn"><b>' + esc(baseName(f.path)) + '</b><i>' + esc(dirName(f.path)) + '</i></span>' +
      '<em>' + fmtSize(f.size) + '</em></button>';
  });
} else {
  var combined = [];
  fl.forEach(function(f) {
    if (f.path.indexOf(state.currentDir) === 0) {
      var rel = f.path.slice(state.currentDir.length);
      if (rel.indexOf('/') > -1) {
        var dName = rel.split('/')[0];
        if (!combined.some(function(x){return x.type==='dir' && x.name===dName;})) {
          combined.push({ type: 'dir', name: dName, path: state.currentDir + dName + '/' });
        }
      } else {
        combined.push({ type: 'file', name: baseName(f.path), path: f.path, f: f });
      }
    }
  });
  
  combined.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  combined.forEach(function(item) {
      if (item.type === 'dir') {
    var folderCount = (p.files || []).filter(function(f) { return f.path.indexOf(item.path) === 0; }).length;
    rows += '<button class="bk-frow" data-dir="' + esc(item.path) + '" style="cursor:pointer;">' +
(state.selecting ? '<span class="bk-chk">' + (state.sel[item.path] ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#ff2d46" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</span>' : '') +
'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
      '<span class="bk-fn"><b>' + esc(item.name) + '</b></span>' +
      '<em style="margin-left:auto;margin-right:8px;">' + folderCount + ' file' + (folderCount === 1 ? '' : 's') + '</em>' +
      '<span style="color:#a2a3ad;padding-right:10px;font-size:16px;">›</span></button>';
  } else {
      var sel = state.sel[item.path];
      rows += '<button class="bk-frow' + (sel ? ' on' : '') + '" data-fp="' + esc(item.path) + '">' +
        (state.selecting ? '<span class="bk-chk">' + (sel ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#ff2d46" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</span>' : '') +
        fileIcon(item.path) +
        '<span class="bk-fn"><b>' + esc(item.name) + '</b></span>' +
        '<em>' + fmtSize(item.f.size) + '</em></button>';
    }
  });
}
    if (!fl.length) rows = '<div class="bk-empty">This project has no files.</div>';
    var selCount = Object.keys(state.sel).length;
    var actionCard = state.selecting ? '<div class="bk-action-card"><div class="bk-ac-row"><button class="bk-ac-btn" id="bkZip"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="10" y="4" width="2" height="2"/><rect x="12" y="6" width="2" height="2"/><rect x="10" y="8" width="2" height="2"/><rect x="12" y="10" width="2" height="2"/><rect x="10" y="13" width="4" height="5" rx="1"/></svg><span>ZIP</span></button><button class="bk-ac-btn" id="bkRaw"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Save</span></button><button class="bk-ac-btn" id="bkDrive"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 15l5-9 4 7h9l-5 9H7L3 15z"/><path d="M8 6l4 7"/><path d="M16 15l-4-7"/></svg><span>Drive</span></button><button class="bk-ac-btn bk-ac-del" id="bkDel"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg><span>Delete</span></button></div><div class="bk-ac-info"><span id="bkCount" style="font-size:11px;font-weight:700;color:var(--muted);">' + selCount + ' selected</span><div style="display:flex;align-items:center;"><button id="bkSelectAll" style="background:none;border:0;color:#cfe0ff;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;padding:4px 6px;margin-right:4px;">Select All</button><button class="bk-ac-cancel" id="bkCancel" style="font-size:12px;">Cancel</button></div></div></div>' : '';
    var searchHtml = '<div style="background:#17181c; border:1px solid #2c2d35; border-radius:16px; padding:6px 16px; display:flex; align-items:center; box-shadow:0 4px 12px rgba(0,0,0,0.15);">' +
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#a2a3ad" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:12px; flex-shrink:0;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
  '<input type="search" id="bkFileSearch" name="q" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="Search files..." value="' + esc(state.fileQ || '') + '" style="flex:1; background:transparent; border:0; color:#fff; padding:14px 0; font-size:15px; outline:none; font-family:inherit;-webkit-appearance:none;">' +
  '<button id="bkFileSearchClear" style="display:' + (state.fileQ ? 'flex' : 'none') + '; background:none; border:0; color:#a2a3ad; font-size:22px; cursor:pointer; padding:0 4px;">&times;</button>' +
'</div>';

var backLabel = state.currentDir ? state.currentDir.replace(/\/$/, '') : 'All projects';
var backRow = '<button class="bk-frow" id="bkBack" style="cursor:pointer;">' +
  '<span style="width:20px;height:20px;flex:none;display:flex;align-items:center;justify-content:center;">' +
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' +
  '</span>' +
  '<span class="bk-fn"><b>' + esc(backLabel) + '</b></span>' +
'</button>';

return searchHtml +
actionCard +
'<div class="bk-files">' + backRow + rows + '</div>';
  }

  function selectedFiles(p) { 
  return sortedFiles(p).filter(function (f) { 
    if (state.sel[f.path]) return true;
    for (var k in state.sel) {
      if (state.sel[k] && k.slice(-1) === '/' && f.path.indexOf(k) === 0) return true;
    }
    return false;
  }); 
}

  function updateBar(p) {
    var n = Object.keys(state.sel).length;
    var c = $('bkCount'); if (c) c.textContent = n + ' selected';
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
  try { var sv = JSON.parse(localStorage.getItem('mb_drive_tok') || 'null'); if (sv && sv.t && Date.now() < sv.e) { driveTok = sv.t; driveTokExp = sv.e; } } catch (e) {}
  function driveSave() { try { if (driveTok) localStorage.setItem('mb_drive_tok', JSON.stringify({ t: driveTok, e: driveTokExp })); else localStorage.removeItem('mb_drive_tok'); } catch (e) {} }
  async function getDriveToken() { var t = await getDriveToken0(); driveSave(); return t; }
  async function getDriveToken0() {
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
      var folderIds = { '': folder.id };
      async function ensureDir(dir) {
        if (folderIds[dir] !== undefined) return folderIds[dir];
        var cut = dir.slice(0, -1), up = cut.lastIndexOf('/');
        var parent = await ensureDir(up < 0 ? '' : cut.slice(0, up + 1));
        var fr2 = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cut.slice(up + 1), mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
        if (!fr2.ok) throw await driveFail(fr2);
        folderIds[dir] = (await fr2.json()).id;
        return folderIds[dir];
      }
      var names = uniqueNames(list);
      for (var i = 0; i < list.length; i++) {
        toast('Uploading ' + (i + 1) + ' of ' + list.length + '\u2026');
        var blob = fileBlob(list[i]);
        var b = 'mbdrive' + Date.now() + i;
        var body = new Blob([
          '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
          JSON.stringify({ name: baseName(list[i].path), parents: [await ensureDir(dirName(list[i].path))] }),
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
            var hasDirs = list.some(function (f) { return f.path.indexOf('/') > -1; });
      if (window.showDirectoryPicker) {
        var root;
        try { root = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e0) { state.busy = false; updateBar(p); return; }
        var top = await root.getDirectoryHandle(safeName(p.name), { create: true });
        for (var i = 0; i < list.length; i++) {
          var parts = list[i].path.split('/'), dh = top;
          for (var j = 0; j < parts.length - 1; j++) dh = await dh.getDirectoryHandle(parts[j], { create: true });
          var fh = await dh.getFileHandle(parts[parts.length - 1], { create: true });
          var w = await fh.createWritable(); await w.write(fileBlob(list[i])); await w.close();
        }
      } else if (hasDirs && await (window.showConfirm ? window.showConfirm('Phone browsers cannot create folders when saving separate files. Save one ZIP instead? It keeps all your folders.', { title: 'Keep folders', confirmText: 'Save ZIP', cancelText: 'Save flat' }) : Promise.resolve(window.confirm('Phone browsers cannot create folders for separate files. Save one ZIP instead?')))) {
        state.busy = false; updateBar(p); runZip(p); return;
      } else {
        for (var i = 0; i < list.length; i++) { download(fileBlob(list[i]), names[i]); await sleep(350); }
      }
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
var tb = document.querySelector('.bk-topbar'); if(tb) tb.style.display = 'flex';
var body = $('bkBody'); if (!body) return;
    var q = (($('bkSearch')||{}).value||'').toLowerCase().trim();
    var filtered = q ? cache.filter(function(p){return (p.name||'').toLowerCase().indexOf(q)>-1;}) : cache;
    body.innerHTML = listHtml(filtered);
    body.querySelectorAll('.bk-proj').forEach(function (b) { b.onclick = function () { openProject(b.dataset.id); }; });
    var bn = $('bkBundle'); 
if (bn) bn.onclick = function () { 
  var o=document.createElement('div');
  o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';
  o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
  document.body.appendChild(o);
  setTimeout(function(){
    if (typeof window.showTab === 'function') window.showTab('bundle'); 
    o.remove();
  }, 350);
};
    var si = $('bkSearch');
if (si) {
  si.oninput = function(){ 
    var cl=$('bkSearchClear');
    if(cl) cl.style.display=si.value?'flex':'none'; 
    showList(); 
  };
}
var sc = $('bkSearchClear');
if (sc) { 
  sc.onclick=function(){
    var si=$('bkSearch');
    if(si){
      si.value='';
      si.dispatchEvent(new Event('input'));
    }
  };  
}
    
  }

  function currentProject() { return cache.find(function (x) { return x.id === state.pid; }) || null; }

  function showFileSheet(p, fp) {
    var old = document.getElementById('bkFileSheet'); if (old) old.remove();
    var fname = baseName(fp);
    var f = (p.files||[]).find(function(x){return x.path===fp;});
    var sh = document.createElement('div'); sh.id = 'bkFileSheet'; sh.className = 'bk-sheet-ov';
    sh.innerHTML = '<div class="bk-sheet">' +
      '<div class="bk-sheet-title">' + esc(fname) + '<span class="bk-sheet-sub">' + (f?fmtSize(f.size):'') + '</span></div>' +
      '<button class="bk-sheet-btn" id="bkSh_dl"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>' +
      '<button class="bk-sheet-btn" id="bkSh_rename"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Rename</button>' +
      '<button class="bk-sheet-btn" id="bkSh_copy"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>' +
      '<button class="bk-sheet-btn" id="bkSh_move"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>Move to project</button>' +
      '<button class="bk-sheet-btn bk-sheet-danger" id="bkSh_del"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>Delete</button>' +
      '<button class="bk-sheet-cancel" id="bkSh_cancel">Cancel</button>' +
      '</div>';
    document.body.appendChild(sh);
    sh.onclick = function(e){ if(e.target===sh) sh.remove(); };
    document.getElementById('bkSh_cancel').onclick = function(){ sh.remove(); };
    document.getElementById('bkSh_dl').onclick = function(){
      sh.remove();
      if(f) { download(fileBlob(f), fname); toast('Downloaded '+fname, 'success'); }
    };
    document.getElementById('bkSh_rename').onclick = async function(){
      sh.remove();
      var n = await (window.showPrompt ? window.showPrompt('Rename', fname, {confirmText:'Rename'}) : Promise.resolve(window.prompt('Rename', fname)));
      if(typeof n!=='string'||!n.trim()||n.trim()===fname) return;
      var newPath = dirName(fp) + n.trim();
      if((p.files||[]).find(function(x){return x.path===newPath;})){toast('A file with that name already exists','error');return;}
      p.files = (p.files||[]).map(function(x){return x.path===fp?Object.assign({},x,{path:newPath,name:n.trim()}):x;});
      p.savedAt=Date.now();
      try{if(typeof dbUpsertProject==='function')await dbUpsertProject(p);}catch(e){}
      toast('Renamed','success'); state.fileQ=''; openProject(p.id);
    };
    document.getElementById('bkSh_copy').onclick = async function(){
      sh.remove();
      var dest = cache.filter(function(x){return x.id!==p.id;});
      if(!dest.length){toast('No other projects to copy to','error');return;}
      var names = dest.map(function(x){return x.name||'Untitled';});
      var idx = await (window.showSelect ? window.showSelect('Copy to project', names) : Promise.resolve(0));
      if(idx==null||idx<0) return;
      var dp = dest[idx];
      var newF = Object.assign({},f,{path: dirName(fp)+fname});
      dp.files = (dp.files||[]).concat([newF]);
      dp.savedAt=Date.now();
      try{if(typeof dbUpsertProject==='function')await dbUpsertProject(dp);}catch(e){}
      toast('Copied to '+dp.name,'success');
    };
    document.getElementById('bkSh_move').onclick = async function(){
      sh.remove();
      var dest = cache.filter(function(x){return x.id!==p.id;});
      if(!dest.length){toast('No other projects to move to','error');return;}
      var names = dest.map(function(x){return x.name||'Untitled';});
      var idx = await (window.showSelect ? window.showSelect('Move to project', names) : Promise.resolve(0));
      if(idx==null||idx<0) return;
      var dp = dest[idx];
      dp.files = (dp.files||[]).concat([Object.assign({},f)]);
      p.files = (p.files||[]).filter(function(x){return x.path!==fp;});
      p.savedAt=Date.now(); dp.savedAt=Date.now();
      try{if(typeof dbUpsertProject==='function'){await dbUpsertProject(p);await dbUpsertProject(dp);}}catch(e){}
      toast('Moved to '+dp.name,'success'); state.fileQ=''; openProject(p.id);
    };
    document.getElementById('bkSh_del').onclick = async function(){
      sh.remove();
      var ok = await (window.showConfirm ? window.showConfirm('Delete "'+fname+'"?',{title:'Delete file',confirmText:'Delete',cancelText:'Keep'}) : Promise.resolve(window.confirm('Delete "'+fname+'"?')));
      if(!ok) return;
      p.files=(p.files||[]).filter(function(x){return x.path!==fp;}); p.savedAt=Date.now();
      try{if(typeof dbUpsertProject==='function')await dbUpsertProject(p);}catch(e){}
      toast('Deleted '+fname,'success'); state.fileQ=''; openProject(p.id);
    };
  }

  function showFilePreview(p, fp) {
  var f = (p.files || []).find(function(x) { return x.path === fp; });
  if (!f) return;
  
  var old = document.getElementById('bkPreviewSheet'); if (old) old.remove();
  var oldRing = document.getElementById('bkPreviewRing'); if (oldRing) oldRing.remove();

  // 1. Show Spinner to load
  var ring = document.createElement('div');
  ring.id = 'bkPreviewRing';
  ring.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0d0e12;display:flex;align-items:center;justify-content:center;';
  ring.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
  document.body.appendChild(ring);

  setTimeout(function() {
    var isImg = /\.(png|jpe?g|gif|webp|ico|svg)$/i.test(f.path);
    var contentHtml = '';
    
    if (isImg && typeof fileBlob === 'function') {
      var url = URL.createObjectURL(fileBlob(f));
      contentHtml = '<div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:auto; background:#f0f0f5; padding:10px;"><img src="' + url + '" style="max-width:100%; max-height:100%; object-fit:contain;"></div>';
    } else {
      var txt = f.text != null ? f.text : 'This file cannot be shown as text.';
      if (txt.length > 200000) txt = txt.slice(0, 200000) + '\n\n... (shortened)';
      contentHtml = '<pre style="flex:1; margin:0; padding:16px; overflow:auto; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; line-height:1.5; white-space:pre; color:#15161a; background:#fff;">' + esc(txt) + '</pre>';
    }
    
    var ov = document.createElement('div');
    ov.id = 'bkPreviewSheet';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;display:flex;flex-direction:column;font-family:system-ui,sans-serif;';
    
    var headHtml = '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e3e4e8;background:#fafafa;">' +
      '<div style="font-size:15px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#15161a;">' + esc(baseName(fp)) + '</div>' +
      '<button id="bkPvClose" style="background:#e4e5ea;border:0;border-radius:0;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;color:#15161a;flex-shrink:0;">Close</button>' +
    '</div>';
    
    ov.innerHTML = headHtml + contentHtml;
    document.body.appendChild(ov);
    ring.remove();
    
    function close() {
      // 2. Show Spinner to go back
      var closeRing = document.createElement('div');
closeRing.id = 'bkPreviewRing';
closeRing.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0d0e12;display:flex;align-items:center;justify-content:center;';
closeRing.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
      document.body.appendChild(closeRing);
      ov.style.display = 'none';

      setTimeout(function() {
        ov.remove();
        closeRing.remove();
        if (isImg && contentHtml.indexOf('blob:') > -1) {
          var match = contentHtml.match(/src="([^"]+)"/);
          if (match && match[1]) URL.revokeObjectURL(match[1]);
        }
      }, 350);
    }
    
    ov.querySelector('#bkPvClose').onclick = close;
  }, 350);
}

function openProject(id) {
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';
  ov.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
  document.body.appendChild(ov);
  
  setTimeout(function(){
  state.pid=id; state.sel={}; state.selecting=false; state.fileQ=state.fileQ||'';
  var p=currentProject(); if(!p){showList();ov.remove();return;}
  var tb=document.querySelector('.bk-topbar'); if(tb) tb.style.display = 'none';
  var body=$('bkBody'); if(!body) {ov.remove();return;}
  body.innerHTML=detailHtml(p);
    $('bkBack').onclick=function(){if(state.currentDir){var parts=state.currentDir.split('/').filter(Boolean);parts.pop();state.currentDir=parts.length?parts.join('/')+'/':'';state.fileQ='';body.innerHTML=detailHtml(p);if(typeof wireActions==='function')wireActions();if(typeof bindRows==='function')bindRows();return;}var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);setTimeout(function(){state.fileQ='';showList();o.remove();},450);};
    var fs=$('bkFileSearch');
if(fs){
  var handleSearch = function(e) {
    var val = e.target.value;
    state.fileQ = val.toLowerCase().trim();
    var cl=$('bkFileSearchClear'); if(cl) cl.style.display=val?'flex':'none';
    var curPos = e.target.selectionStart;
    var scrollTop = body.scrollTop;
    body.innerHTML=detailHtml(p);
    body.scrollTop = scrollTop;
    $('bkBack').onclick=function(){if(state.currentDir){var parts=state.currentDir.split('/').filter(Boolean);parts.pop();state.currentDir=parts.length?parts.join('/')+'/':'';state.fileQ='';body.innerHTML=detailHtml(p);if(typeof wireActions==='function')wireActions();if(typeof bindRows==='function')bindRows();return;}var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);setTimeout(function(){state.fileQ='';showList();o.remove();},450);};
    wireActions(); bindRows();
    var newFs = $('bkFileSearch');
    if(newFs) { 
        newFs.focus(); 
        newFs.setSelectionRange(curPos, curPos); 
        newFs.oninput = handleSearch; // Rebind the typing event to the new input
    }
  };
  fs.oninput = handleSearch;
}
var fc=$('bkFileSearchClear');
if(fc){
  fc.onclick=function(){
    state.fileQ='';
    body.innerHTML=detailHtml(p);
    $('bkBack').onclick=function(){if(state.currentDir){var parts=state.currentDir.split('/').filter(Boolean);parts.pop();state.currentDir=parts.length?parts.join('/')+'/':'';state.fileQ='';body.innerHTML=detailHtml(p);if(typeof wireActions==='function')wireActions();if(typeof bindRows==='function')bindRows();return;}var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);setTimeout(function(){state.fileQ='';showList();o.remove();},450);};
    wireActions(); bindRows();
  };
}
    function wireActions(){
  var z=$('bkZip'),r=$('bkRaw'),d=$('bkDrive'),del=$('bkDel'),cx=$('bkCancel');
  if(z)z.onclick=function(){runZip(p);};
  if(r)r.onclick=function(){runRaw(p);};
  if(d)d.onclick=function(){driveChooser(p);};
  if(del)del.onclick=function(){runDelete(p);};
  if(cx)cx.onclick=function(){state.sel={};state.selecting=false;body.innerHTML=detailHtml(p); if(typeof wireActions==='function')wireActions(); if(typeof bindRows==='function')bindRows();};
  
  var sa = $('bkSelectAll');
  if(sa) {
    var elements = Array.from(body.querySelectorAll('[data-dir], [data-fp]'));
    var allSelected = elements.length > 0 && elements.every(function(el){ return state.sel[el.dataset.dir || el.dataset.fp]; });
    sa.textContent = allSelected ? 'Deselect All' : 'Select All';
    
    sa.onclick = function() {
        elements.forEach(function(el) {
            var key = el.dataset.dir || el.dataset.fp;
            if (allSelected) {
                delete state.sel[key];
            } else {
                state.sel[key] = true;
            }
        });
        if (Object.keys(state.sel).length === 0) state.selecting = false;
        body.innerHTML=detailHtml(p); if(typeof wireActions==='function')wireActions(); if(typeof bindRows==='function')bindRows();
    };
}
  updateBar(p);
}
    function bindRows(){
      wireActions();
      var longTimer;
      body.querySelectorAll('.bk-frow').forEach(function(btn){
  if(btn.id === 'bkBack'){
  btn.onclick = function(){
    var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);
    setTimeout(function(){
      if(state.currentDir){
        var parts = state.currentDir.split('/').filter(Boolean);
        parts.pop();
        state.currentDir = parts.length ? parts.join('/') + '/' : '';
        state.fileQ = '';
        body.innerHTML = detailHtml(p);
        if(typeof wireActions==='function') wireActions();
        if(typeof bindRows==='function') bindRows();
        o.remove();
        return;
      }
      state.fileQ='';showList();o.remove();
    }, 350);
  };
  return;
}
  btn.oncontextmenu=function(e){e.preventDefault();};
        var mb=btn.querySelector('.bk-more');
        if(mb){mb.onclick=function(e){e.stopPropagation();showFileSheet(p,btn.dataset.fp);};}
        btn.addEventListener('touchstart',function(){longTimer=setTimeout(function(){
  if(!state.selecting)state.selecting=true;
  var key = btn.dataset.dir || btn.dataset.fp;
  if(key){
      if(state.sel[key])delete state.sel[key];else state.sel[key]=true;
  }
  if (Object.keys(state.sel).length === 0) state.selecting = false;
  body.innerHTML=detailHtml(p);$('bkBack').onclick=function(){if(state.currentDir){var parts=state.currentDir.split('/').filter(Boolean);parts.pop();state.currentDir=parts.length?parts.join('/')+'/':'';state.fileQ='';body.innerHTML=detailHtml(p);if(typeof wireActions==='function')wireActions();if(typeof bindRows==='function')bindRows();return;}var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);setTimeout(function(){state.fileQ='';showList();o.remove();},450);};wireActions();bindRows();
        },500);},{passive:true});
        btn.addEventListener('touchend',function(){clearTimeout(longTimer);},{passive:true});
        btn.addEventListener('touchmove',function(){clearTimeout(longTimer);},{passive:true});
              btn.onclick=function(e){
if(e.target.closest('.bk-more'))return;
if(btn.dataset.dir && !state.selecting){
  var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);
  setTimeout(function(){
    state.currentDir = btn.dataset.dir;
    state.fileQ = '';
    body.innerHTML = detailHtml(p);
    if(typeof wireActions==='function')wireActions();
    if(typeof bindRows==='function')bindRows();
    o.remove();
  }, 350);
  return;
}
          if(state.selecting){var key = btn.dataset.dir || btn.dataset.fp;if(key){if(state.sel[key])delete state.sel[key];else state.sel[key]=true;}if (Object.keys(state.sel).length === 0) state.selecting = false;body.innerHTML=detailHtml(p);$('bkBack').onclick=function(){if(state.currentDir){var parts=state.currentDir.split('/').filter(Boolean);parts.pop();state.currentDir=parts.length?parts.join('/')+'/':'';state.fileQ='';body.innerHTML=detailHtml(p);if(typeof wireActions==='function')wireActions();if(typeof bindRows==='function')bindRows();return;}var o=document.createElement('div');o.style.cssText='position:fixed;left:0;right:0;top:44px;bottom:60px;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';o.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(o);setTimeout(function(){state.fileQ='';showList();o.remove();},450);};wireActions();bindRows();} else if (btn.dataset.fp) { showFilePreview(p, btn.dataset.fp); }
        };
      });
    }
      bindRows();
  window.scrollTo&&window.scrollTo(0,0);
  ov.remove();
        }, 450);
}

  async function render() {
    if (!$('bkBody')) return;
    await loadProjects();
    if (state.pid && currentProject()) openProject(state.pid); else showList();
  }

  function build() {
  var page = $('backupsPage'); if (!page) return false;
  page.innerHTML = '<div class="bk-topbar"><span class="bk-topbar-title">Backups</span><div class="bk-topbar-tools"><div class="bk-search-wrap"><input class="bk-search" id="bkSearch" type="search" name="q" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore style="-webkit-appearance:none;" placeholder="Search projects\u2026"><button class="bk-search-clear" id="bkSearchClear" style="display:none">\u00d7</button></div></div></div><div id="bkBody"></div>';
  return true;
}

  function injectCss() {
  if ($('bkStyle')) return;
  var st = document.createElement('style'); st.id = 'bkStyle';
  st.textContent = [
    '#bkBody{display:flex;flex-direction:column;gap:12px; padding-top:0!important;}',
    'main:has(#backupsPage:not([hidden])) { padding-top:8px !important; }',
      '.bk-list{display:flex;flex-direction:column;background:#101115;border:1px solid #25262c;border-top:0;border-radius:0 0 16px 16px;overflow:hidden;margin:0 0 16px 0;box-shadow:0 4px 12px rgba(0,0,0,0.1)}',
'.bk-proj{display:flex;align-items:center;gap:12px;text-align:left;background:transparent;border:0;border-bottom:1px solid #25262c;border-radius:0;padding:16px 14px;color:var(--text);cursor:pointer;width:100%;font-family:inherit;transition:background .14s ease}',
'.bk-proj:last-child{border-bottom:0}',
'.bk-proj:active{background:#1a1b20}',
      '.bk-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.bk-proj b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}',
      '.bk-proj small{font-size:11px;color:var(--muted)}',
      '.bk-proj .bk-chev{color:var(--muted);display:flex;align-items:center}',
      '.bk-ic{width:32px;height:32px;border-radius:9px;background:#2f3a52;color:#cfe0ff;display:grid;place-items:center;flex:none}',
      '.bk-link{background:none;border:0;color:#cfe0ff;font-size:13px;font-weight:700;text-align:left;padding:8px 2px;margin:0;cursor:pointer;font-family:inherit}',
'.bk-empty{color:var(--muted);font-size:12.5px;line-height:1.5;text-align:center;padding:22px 16px;margin:0 14px;}',
      '.bk-back{align-self:flex-start;background:#1c1d22;border:1px solid var(--line);color:#e5e6ea;border-radius:9px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease}',
      '.bk-back:active{transform:scale(.96)}',
      '.bk-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}',
      '.bk-head h2{margin:2px 0 0;font-size:17px;overflow-wrap:anywhere}',
      '.bk-hint{font-size:11.5px;color:var(--muted);line-height:1.5}',
      '.bk-files{display:flex;flex-direction:column;border:1px solid #25262c;border-radius:14px;overflow:hidden;background:#101115}',
      '.bk-dir-row{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#17181c;border-bottom:1px solid #1f2026;font-size:11px;font-weight:800;color:#a2a3ad;letter-spacing:.5px}',
      '.bk-frow{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid #1f2026;background:transparent;border-left:0;border-right:0;border-top:0;color:var(--text);cursor:pointer;font-family:inherit;text-align:left;width:100%;transition:background .12s ease;user-select:none;-webkit-user-select:none}',
      '.bk-frow:last-child{border-bottom:0}',
      '.bk-frow:active{background:#1a1b20}',
      '.bk-frow.on{background:#1e1a2a}',
      '.bk-chk{width:20px;height:20px;border:2px solid #35363e;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none;background:#101115}.bk-frow.on .bk-chk{border-color:#ff2d46;background:#2a1020}',
      '.bk-fn{flex:1;min-width:0;display:flex;flex-direction:column}',
      '.bk-fn b{font-size:13px;overflow-wrap:anywhere;font-weight:600}',
      '.bk-fn i{font-style:normal;font-size:10.5px;color:var(--muted);overflow-wrap:anywhere}',
      '.bk-frow em{font-style:normal;font-size:10.5px;color:var(--muted);flex-shrink:0}',
      '.bk-action-card{position:sticky;bottom:0;z-index:10;background:#17181c;border:1px solid #25262c;border-radius:12px;padding:8px 10px;margin-bottom:8px;display:flex;flex-direction:column;gap:8px}',
'.bk-ac-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
'.bk-ac-btn{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;background:#20222a;border:1px solid #2c2d34;border-radius:10px;color:#e6e6e8;padding:8px 4px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .12s ease,background .12s ease}',
      '.bk-ac-btn:active{transform:scale(.94);background:#2a2c34}',
      '.bk-ac-btn:disabled{opacity:.35}',
      '.bk-ac-del{color:#ff8a8a!important;border-color:#5a2430!important;background:#25131a!important}',
      '.bk-ac-info{display:flex;align-items:center;justify-content:space-between}',
      '#bkCount{font-size:12px;font-weight:700;color:var(--muted)}',
      '.bk-ac-cancel{background:none;border:0;color:#ff2d46;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;padding:4px 0}',
      '.bk-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:#17181c;position:sticky;top:0;z-index:5;border:1px solid #25262c;border-bottom:0;border-radius:16px 16px 0 0;margin:8px 0 0 0;box-shadow:0 4px 12px rgba(0,0,0,0.15)}',
'.bk-topbar-title{font-size:20px;font-weight:800;color:#fff;white-space:nowrap}',
'.bk-topbar-tools{flex:1;max-width:220px}',
'.bk-search-wrap{position:relative;width:100%}',
'.bk-search,.bk-file-search{background:#0f1013;border:1px solid #303139;color:#fff;border-radius:99px;padding:10px 34px 10px 16px;font-size:14px;outline:none;font-family:inherit;width:100%;box-sizing:border-box;transition:border-color .2s;-webkit-appearance:none}',
'.bk-search:focus,.bk-file-search:focus{border-color:var(--red)}',
      '.bk-search-clear{position:absolute;right:6px;background:none;border:0;color:#a2a3ad;font-size:16px;cursor:pointer;line-height:1;padding:2px 4px}',
      '.bk-menu-btn{background:#20222a;border:1px solid #303139;color:#e6e6e8;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer}',
      '.bk-det-top{display:flex;align-items:center;gap:8px;padding:10px 14px 8px;background:#17181c;position:sticky;top:0;z-index:5;border-bottom:1px solid #25262c}',
      '.bk-det-name{flex:1;font-size:15px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bk-det-pill{background:#2a2c34;color:#a2a3ad;border-radius:20px;padding:2px 9px;font-size:11px;font-weight:700;flex:none}',
      '.bk-file-search-wrap{display:flex;align-items:center;gap:0;padding:8px 14px;background:#17181c;border-bottom:1px solid #25262c;position:sticky;top:49px;z-index:4}',
      '.bk-file-search{width:100%;box-sizing:border-box}',
      '.bk-file-search:focus{width:100%}',
      '.bk-more{background:none;border:0;padding:6px 8px;display:flex;align-items:center;cursor:pointer;flex:none;margin-left:auto}',
      '.bk-sheet-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px}',
      '.bk-sheet{width:100%;max-width:440px;background:#17181c;border:1px solid #25262c;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px}',
      '.bk-sheet-title{font-weight:800;font-size:15px;color:#fff;padding:2px 4px 6px;border-bottom:1px solid #25262c;display:flex;align-items:center;justify-content:space-between}',
      '.bk-sheet-sub{font-size:11px;font-weight:500;color:#a2a3ad}',
      '.bk-sheet-btn{display:flex;align-items:center;gap:12px;background:#20222a;border:1px solid #2c2d34;border-radius:12px;color:#e6e6e8;padding:12px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:left;width:100%}',
      '.bk-sheet-btn:active{background:#2a2c34}',
      '.bk-sheet-danger{color:#ff8a8a!important;border-color:#5a2430!important;background:#25131a!important}',
      '.bk-sheet-cancel{background:none;border:0;color:#a2a3ad;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:center;padding:8px 0 2px}'
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

  /* ---- Google Drive manager (menu page) ---- */
  var dv = { folder: 'root', trail: [{ id: 'root', name: 'My Drive' }], items: [], busy: false };
  var DV_API = 'https://www.googleapis.com/drive/v3/files';
  var DV_FOLDER = 'application/vnd.google-apps.folder';

  function dvHasToken() { return !!(driveTok && Date.now() < driveTokExp); }
  function dvPage() { return document.getElementById('drivePage'); }

  async function dvCall(path, method, body) {
    if (!dvHasToken()) { var a1 = new Error('Connect Google Drive again'); a1.dvAuth = true; throw a1; }
    var r = await fetch(path, {
      method: method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + driveTok }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status === 401) { driveTok = null; driveTokExp = 0; driveSave(); var a2 = new Error('Connect Google Drive again'); a2.dvAuth = true; throw a2; }
    if (!r.ok) throw await driveFail(r);
    return r.status === 204 ? null : r.json();
  }

  async function dvList() {
    var q = "'" + dv.folder + "' in parents and trashed=false";
    var d = await dvCall(DV_API + '?q=' + encodeURIComponent(q) +
      '&fields=' + encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink,parents)') +
      '&orderBy=' + encodeURIComponent('folder,name') + '&pageSize=200');
    dv.items = d.files || [];
  }

  function dvErr(e) {
    if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) { toast('Google Drive cancelled'); return; }
    if (e && e.dvAuth) { dvRender(); toast('Tap Connect Google Drive to continue', 'error'); return; }
    toast((e && e.message) || 'Google Drive problem', 'error');
  }

  async function dvLoad() {
    if (dv.busy) return;
    dv.busy = true;
    try { await dvList(); dvRender(); } catch (e) { dvErr(e); }
    dv.busy = false;
  }

  async function dvConnect() {
    try { toast('Connecting to Google Drive\u2026'); await getDriveToken(); await dvLoad(); } catch (e) { dvErr(e); }
  }

  function dvOpen() { if (dvHasToken()) dvLoad(); else dvRender(); }

  function dvIcon(f) {
    var n = String(f.name || '').toLowerCase(), m = f.mimeType || '';
    var e = n.indexOf('.') > -1 ? n.split('.').pop() : '';
    function S(c, d) { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="' + c + '" fill-rule="evenodd"><path d="' + d + '"/></svg>'; }
    var DOC = 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z';
    if (m === DV_FOLDER) return S('#c9cacc', 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z');
    if (/^(zip|rar|7z|gz|tar)$/.test(e) || /zip/.test(m)) {
      return '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="#9aa0a6"/><g fill="#1f2025"><rect x="10" y="4.5" width="2" height="2"/><rect x="12" y="6.5" width="2" height="2"/><rect x="10" y="8.5" width="2" height="2"/><rect x="12" y="10.5" width="2" height="2"/></g><rect x="10" y="13.5" width="4" height="5.5" rx="1" fill="#1f2025"/></svg>';
    }
    if (/^(mp3|wav|m4a|ogg|flac|aac)$/.test(e) || m.indexOf('audio/') === 0) {
      return S('#ea4335', 'M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z');
    }
    if (/^(png|jpg|jpeg|gif|webp|bmp)$/.test(e) || m.indexOf('image/') === 0 && e !== 'svg') {
      return S('#ea4335', 'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z');
    }
    if (/^(mp4|mov|webm|mkv|avi)$/.test(e) || m.indexOf('video/') === 0) {
      return S('#ea4335', 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4h-4z');
    }
    if (e === 'pdf' || m === 'application/pdf') return S('#ea4335', DOC);
    if (/^(csv|xls|xlsx|tsv)$/.test(e) || /spreadsheet/.test(m)) {
      return S('#0f9d58', 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM11 19H5v-4h6v4zm0-6H5V9h6v4zm8 6h-6v-4h6v4zm0-6h-6V9h6v4zM19 7H5V5h14v2z');
    }
    return S('#4285f4', DOC);
  }

  function dvRender() {
    var pg = dvPage(); if (!pg) return;
    var head = '<section class="card"><label class="eyebrow">GOOGLE DRIVE</label><h1>Your <span>Drive</span></h1><p>Files and folders Multi Bundle saved to your Google Drive. Rename, move or delete them here.</p></section>';
    if (!dvHasToken()) {
      pg.innerHTML = head + '<section class="card"><button class="btn primary" id="dvConnect" style="width:100%">Connect Google Drive</button></section>';
      return;
    }
    var crumbs = dv.trail.map(function (t, i) {
      return '<button class="dv-crumb" data-i="' + i + '">' + esc(t.name) + '</button>';
    }).join('<span class="dv-sep">\u203a</span>');
    var rows = dv.items.map(function (f, i) {
      var isF = f.mimeType === DV_FOLDER;
      var sub = isF ? 'Folder' : (f.size ? fmtSize(Number(f.size)) : 'File');
      return '<div class="dv-row"><button class="dv-main" data-i="' + i + '" data-a="open"><span class="dv-ic">' + dvIcon(f) +
        '</span><span class="dv-nm"><b>' + esc(f.name) + '</b><i>' + sub + '</i></span></button>' +
        '<button class="dv-more" data-i="' + i + '" data-a="menu" aria-label="Options">\u22EE</button></div>';
    }).join('') || '<div class="dv-empty">Nothing here yet. Upload with the Google Drive button in Files.</div>';
    pg.innerHTML = head + '<section class="card"><div class="dv-bar">' + crumbs + '</div>' +
      '<div class="dv-tools"><button class="btn secondary" id="dvNew">New folder</button><button class="btn secondary" id="dvRefresh">Refresh</button></div>' +
      '<div class="dv-list">' + rows + '</div></section>';
  }

  function dvSheet(title, btns) {
    var old = document.getElementById('dvSheet'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'dvSheet'; ov.className = 'dv-ov';
    ov.innerHTML = '<div class="dv-sheet"><div class="dv-st">' + esc(title) + '</div><div class="dv-sb"></div></div>';
    var box = ov.querySelector('.dv-sb');
    btns.concat([{ label: 'Cancel' }]).forEach(function (b) {
      var el = document.createElement('button');
      el.className = 'btn secondary' + (b.danger ? ' dv-danger' : '');
      el.textContent = b.label;
      el.onclick = function () { ov.remove(); if (b.fn) b.fn(); };
      box.appendChild(el);
    });
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }

  function dvOpenItem(f) {
    if (f.mimeType === DV_FOLDER) { dv.trail.push({ id: f.id, name: f.name }); dv.folder = f.id; dvLoad(); }
    else window.open(f.webViewLink || 'https://drive.google.com/drive/my-drive', '_blank');
  }

  function dvMenu(f) {
    var isF = f.mimeType === DV_FOLDER;
    dvSheet(f.name, [
      { label: isF ? 'Open folder' : 'Open in Drive', fn: function () { dvOpenItem(f); } },
      { label: 'Rename', fn: function () { dvRename(f); } },
      { label: 'Move to\u2026', fn: function () { dvMove(f); } },
      { label: 'Move to trash', danger: true, fn: function () { dvTrash(f); } }
    ]);
  }

  async function dvRename(f) {
    var n = await window.showPrompt('Rename', f.name, { confirmText: 'Rename' });
    if (typeof n !== 'string') return;
    n = n.trim(); if (!n || n === f.name) return;
    try { await dvCall(DV_API + '/' + f.id + '?fields=id', 'PATCH', { name: n }); toast('Renamed', 'success'); await dvLoad(); } catch (e) { dvErr(e); }
  }

  async function dvTrash(f) {
    var ok = await window.showConfirm('Move "' + f.name + '" to your Google Drive trash? You can restore it from the trash in Drive.', { title: 'Move to trash', confirmText: 'Move to trash', cancelText: 'Keep' });
    if (!ok) return;
    try { await dvCall(DV_API + '/' + f.id + '?fields=id', 'PATCH', { trashed: true }); toast('Moved to trash', 'success'); await dvLoad(); } catch (e) { dvErr(e); }
  }

  async function dvMove(f) {
    try {
      var q = "mimeType='" + DV_FOLDER + "' and trashed=false";
      var d = await dvCall(DV_API + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,modifiedTime)') + '&orderBy=name&pageSize=200');
      var dests = [{ id: 'root', label: 'My Drive (top level)' }].concat((d.files || []).filter(function (x) { return x.id !== f.id; }).map(function (x) {
        return { id: x.id, label: x.name + '  \u00B7  ' + new Date(x.modifiedTime).toLocaleDateString() };
      }));
      dvSheet('Move "' + f.name + '" to', dests.map(function (x) { return { label: x.label, fn: function () { dvDoMove(f, x); } }; }));
    } catch (e) { dvErr(e); }
  }

  async function dvDoMove(f, dest) {
    if (dest.id === dv.folder) { toast('Already in that folder'); return; }
    var from = (f.parents && f.parents[0]) || dv.folder;
    try {
      await dvCall(DV_API + '/' + f.id + '?addParents=' + encodeURIComponent(dest.id) + '&removeParents=' + encodeURIComponent(from) + '&fields=id', 'PATCH', {});
      toast('Moved', 'success'); await dvLoad();
    } catch (e) { dvErr(e); }
  }

  async function dvNewFolder() {
    var n = await window.showPrompt('New folder', '', { placeholder: 'Folder name', confirmText: 'Create' });
    if (typeof n !== 'string' || !n.trim()) return;
    try { await dvCall(DV_API + '?fields=id', 'POST', { name: n.trim(), mimeType: DV_FOLDER, parents: [dv.folder] }); toast('Folder created', 'success'); await dvLoad(); } catch (e) { dvErr(e); }
  }

  function dvClick(e) {
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'dvConnect') return dvConnect();
    if (b.id === 'dvNew') return dvNewFolder();
    if (b.id === 'dvRefresh') return dvLoad();
    if (b.classList.contains('dv-crumb')) {
      var i = Number(b.dataset.i); dv.trail = dv.trail.slice(0, i + 1); dv.folder = dv.trail[i].id; return dvLoad();
    }
    var f = dv.items[Number(b.dataset.i)]; if (!f) return;
    if (b.dataset.a === 'open') return dvOpenItem(f);
    if (b.dataset.a === 'menu') return dvMenu(f);
  }

  function dvBuild() {
    if (dvPage()) return;
    var main = document.querySelector('main'); if (!main) return;
    var pg = document.createElement('section'); pg.id = 'drivePage'; pg.className = 'tab-page'; pg.hidden = true;
    main.appendChild(pg);
    pg.addEventListener('click', dvClick);
    var nav = document.querySelector('.drawer-nav');
    if (nav && !nav.querySelector('[data-tab="drive"]')) {
      var a = document.createElement('a'); a.setAttribute('data-tab', 'drive');
      a.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg><span>Google Drive</span>';
      nav.insertBefore(a, nav.querySelector('[data-tab="settings"]') || null);
    }
    var st = document.createElement('style'); st.id = 'dvStyle';
    st.textContent = [
      '.dv-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:10px}',
      '.dv-crumb{background:none;border:0;color:var(--text);font-weight:700;font-size:13px;padding:4px 2px;cursor:pointer;font-family:inherit}',
      '.dv-sep{color:var(--muted)}',
      '.dv-tools{display:flex;gap:8px;margin-bottom:10px}',
      '.dv-tools .btn{flex:1}',
      '.dv-list{display:flex;flex-direction:column;gap:6px}',
      '.dv-row{display:flex;align-items:center;background:#17181c;border:1px solid #25262c;border-radius:12px}',
      '.dv-main{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--text);text-align:left;padding:10px 11px;cursor:pointer;font-family:inherit}',
      '.dv-ic{flex:none;width:44px;height:44px;border-radius:12px;background:#202126;display:flex;align-items:center;justify-content:center}',
      '.dv-nm{display:flex;flex-direction:column;min-width:0}',
      '.dv-nm b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dv-nm i{font-size:11px;color:var(--muted);font-style:normal}',
      '.dv-more{background:none;border:0;color:var(--text);font-size:22px;padding:8px 14px;cursor:pointer}',
      '.dv-empty{color:var(--muted);font-size:13px;padding:14px 4px}',
      '.dv-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:14px}',
      '.dv-sheet{width:100%;max-width:420px;background:#17181c;border:1px solid #25262c;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;color:#fff}',
      '.dv-st{font-weight:800;font-size:15px;word-break:break-word}',
      '.dv-sb{display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow-y:auto}',
      '.dv-danger{color:#ff8a8a!important;border-color:#5a2430!important;background:#25131a!important}'
    ].join('\n');
    document.head.appendChild(st);
  }
  dvBuild();

  function dvAddProjBtn() {
    var inp = document.getElementById('zipInput');
    var lab = inp && inp.parentNode;
    if (!lab || !lab.parentNode || document.getElementById('projImportDrive')) return;
    var b = document.createElement('button');
    b.id = 'projImportDrive'; b.className = 'btn secondary'; b.type = 'button';
    b.textContent = 'Google Drive';
    b.onclick = function () { window.showTab('drive'); };
    lab.parentNode.insertBefore(b, lab.nextSibling);
  }
  dvAddProjBtn();

  var origShowDv = window.showTab;
  window.showTab = function (name) {
    if (typeof origShowDv === 'function') origShowDv(name);
    var pg = dvPage(); if (pg) pg.hidden = (name !== 'drive');
    if (name === 'drive') dvOpen();
    if (name === 'projects') dvAddProjBtn();
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-tab]'); if (!el) return;
    var pg = dvPage(); if (!pg) return;
    if (el.dataset.tab === 'drive') window.showTab('drive'); else pg.hidden = true;
  }, true);
  try { var navDv = JSON.parse(localStorage.getItem('mb_nav') || 'null'); if (navDv && navDv.tab === 'drive') setTimeout(function () { window.showTab('drive'); }, 300); } catch (e) {}

  window.__bk = { uniqueNames: uniqueNames, fmtSize: fmtSize, safeName: safeName, listHtml: listHtml, detailHtml: detailHtml, makeZip: makeZip, _state: state };
})();

