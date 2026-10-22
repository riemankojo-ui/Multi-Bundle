/* Multi Bundle - Files manager: a Files button next to + opens a big card to create, move, delete and save. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var newBtn = $('editorNewBtn'), ta = $('editorTextarea');
  if (!newBtn || !ta || $('editorFilesBtn')) return;

  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function ask(title, def, opts) { return window.showPrompt ? window.showPrompt(title, def, opts) : Promise.resolve(null); }
  function sure(msg, opts) { return window.showConfirm ? window.showConfirm(msg, opts) : Promise.resolve(false); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pid() { return (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : ''; }
  function curPath() { var s = $('editorFileSelect'); return s ? s.value : ''; }
  function isDir(k) { return k.slice(-1) === '/'; }
  function base(p) { return p.split('/').pop(); }
  function clean(raw) {
    var s = String(raw || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
    if (!s || /(^|\/)\.\.?(\/|$)/.test(s) || /[\u0000-\u001f<>:"|?*\\]/.test(s)) return '';
    return s;
  }

  /* ---------- empty folders (kept per project in this phone) ---------- */
  function vfGet() { try { return JSON.parse(localStorage.getItem('mb_folders_' + pid()) || '[]'); } catch (e) { return []; } }
  function vfSet(a) { try { localStorage.setItem('mb_folders_' + pid(), JSON.stringify(a)); } catch (e) {} }
  function addPrefixes(path, set, includeSelf) {
    var parts = path.split('/'); if (!includeSelf) parts.pop();
    var acc = '';
    parts.forEach(function (s) { acc = acc ? acc + '/' + s : s; set[acc] = 1; });
  }
  function allFolders() {
    var set = {};
    files.forEach(function (f) { addPrefixes(f.path, set, false); });
    vfGet().forEach(function (p) { addPrefixes(p, set, true); });
    return Object.keys(set).sort();
  }
  function items() {
    var list = [];
    allFolders().forEach(function (p) { list.push({ key: p + '/', path: p, dir: true }); });
    files.forEach(function (f) { list.push({ key: f.path, path: f.path, dir: false, f: f }); });
    list.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    return list;
  }

  /* ---------- selection ---------- */
  var sel = {};
  function selFolders() { return Object.keys(sel).filter(function (k) { return isDir(k) && sel[k]; }); }
  function selFiles() { return files.filter(function (f) { return sel[f.path]; }); }
  function baseFolder() { var k = selFolders(); return k.length === 1 ? k[0] : ''; }
  function toggle(key) {
    var on = !sel[key];
    if (on) sel[key] = true; else delete sel[key];
    if (isDir(key)) {
      items().forEach(function (it) {
        if (it.key !== key && it.key.indexOf(key) === 0) { if (on) sel[it.key] = true; else delete sel[it.key]; }
      });
    }
    if (!on) Object.keys(sel).forEach(function (k) { if (isDir(k) && k !== key && key.indexOf(k) === 0) delete sel[k]; });
  }

  /* ---------- project helpers ---------- */
  function syncCurrent() {
    var cp = curPath(), f = files.find(function (x) { return x.path === cp; });
    if (f && f.text != null && ta.value !== f.text) { f.text = ta.value; f.size = f.text.length; }
  }
  async function snapshot(label, removed, added) {
    try {
      var all = await dbGetAll(), p = all.find(function (x) { return x.id === pid(); });
      if (p) {
        p.snapshots = p.snapshots || [];
        p.snapshots.unshift({ ts: Date.now(), label: label, files: files.map(function (f) { return { path: f.path, name: f.name, size: f.size, type: f.type, text: f.text, blob: f.blob }; }) });
        p.deletedPaths = (p.deletedPaths || []).filter(function (x) { return removed.indexOf(x) === -1 && added.indexOf(x) === -1; }).concat(removed);
        if (p.snapshots.length > 20) p.snapshots.length = 20;
        await dbSetAll(all);
      }
    } catch (e) {}
  }
  function dropDraft(path) { try { localStorage.removeItem('mb_draft_' + pid() + '_' + path); } catch (e) {} }
  async function finish(openPath, type, note, logPath) {
    try { localStorage.setItem('mb_file', JSON.stringify({ pid: pid(), path: openPath || '' })); } catch (e) {}
    if (openPath && window.__edOpenFile) window.__edOpenFile(openPath);
    else {
      if (!files.some(function (f) { return f.text != null; })) ta.value = '';
      if (window.__edReloadCurrent) window.__edReloadCurrent([]);
    }
    if (typeof populatePages === 'function') populatePages();
    if (typeof render === 'function') render();
    if (typeof window.saveCurrentProject === 'function') await window.saveCurrentProject();
    if (typeof window.logHistory === 'function') window.logHistory({ type: type, path: logPath, note: note });
  }

  /* ---------- actions ---------- */
  async function doCreateFile() {
    var b = baseFolder();
    var name = await ask('New text file', b, { message: 'Type a name like notes.txt or pages/about.txt', confirmText: 'Create' });
    if (name == null) return;
    var p = clean(name);
    if (!p) { toast('That name is not allowed', 'error'); return; }
    if (base(p).indexOf('.') < 0) p += '.txt';
    var low = p.toLowerCase();
    if (files.some(function (f) { return f.path.toLowerCase() === low; })) { toast('File already exists', 'error'); return; }
    if (allFolders().some(function (d) { return d.toLowerCase() === low; })) { toast('A folder has that name', 'error'); return; }
    syncCurrent();
    files.push({ path: p, name: base(p), size: 0, type: 'text/plain', blob: null, text: '' });
    files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    close();
    await finish(p, 'new', 'Created file', p);
    toast('Created ' + p, 'success');
  }
  async function doCreateFolder() {
    var b = baseFolder();
    var name = await ask('New folder', '', { message: b ? 'It will be created inside ' + b : 'Type a folder name, like pages', confirmText: 'Create' });
    if (name == null) return;
    var n = clean(name);
    if (!n) { toast('That name is not allowed', 'error'); return; }
    var full = b + n, low = full.toLowerCase();
    if (files.some(function (f) { return f.path.toLowerCase() === low; })) { toast('A file has that name', 'error'); return; }
    if (allFolders().some(function (d) { return d.toLowerCase() === low; })) { toast('Folder already exists', 'error'); return; }
    var v = vfGet(); v.push(full); vfSet(v);
    toast('Created folder ' + full, 'success');
    paintAll();
  }
  async function doDelete() {
    var chosen = selFiles(), fk = selFolders();
    if (!chosen.length && !fk.length) { toast('Select files first', 'error'); return; }
    var msg = chosen.length ? 'Delete ' + chosen.length + ' file' + (chosen.length === 1 ? '' : 's') + (fk.length ? ' and ' + fk.length + ' folder' + (fk.length === 1 ? '' : 's') : '') + '?' : 'Delete ' + fk.length + ' empty folder' + (fk.length === 1 ? '' : 's') + '?';
    var ok = await sure(msg, { title: 'Delete', confirmText: 'Delete', cancelText: 'Cancel' });
    if (!ok) return;
    var cp = curPath(), paths = chosen.map(function (f) { return f.path; });
    if (paths.length) await snapshot('Before delete', paths, []);
    files = files.filter(function (f) { return paths.indexOf(f.path) === -1; });
    paths.forEach(dropDraft);
    vfSet(vfGet().filter(function (v) { return !fk.some(function (k) { return (v + '/').indexOf(k) === 0; }); }));
    var keep = (paths.indexOf(cp) === -1 && files.some(function (f) { return f.path === cp; })) ? cp : '';
    if (!keep) { var nx = files.find(function (f) { return f.text != null; }); keep = nx ? nx.path : ''; }
    close();
    await finish(keep, 'delete', 'Deleted ' + paths.length + ' file' + (paths.length === 1 ? '' : 's'), paths[0] || '');
    toast('Deleted', 'success');
  }
  async function doMove(dest) {
    var chosen = selFiles(), fk = selFolders(), map = {};
    chosen.forEach(function (f) {
      var p = f.path, top = null;
      fk.forEach(function (k) { if (p.indexOf(k) === 0 && (!top || k.length < top.length)) top = k; });
      var rel = top ? p.slice(top.slice(0, -1).lastIndexOf('/') + 1) : base(p);
      var np = dest + rel;
      if (np !== p) map[p] = np;
    });
    var olds = Object.keys(map);
    var vf = vfGet(), vch = false;
    fk.forEach(function (k) {
      var fp = k.slice(0, -1);
      if (vf.indexOf(fp) > -1 && !files.some(function (f) { return f.path.indexOf(k) === 0; })) {
        var nf = dest + base(fp);
        if (nf !== fp) { vf = vf.filter(function (x) { return x !== fp; }); vf.push(nf); vch = true; }
      }
    });
    if (!olds.length && !vch) { toast('Nothing to move', 'error'); return; }
    var seen = {};
    for (var i = 0; i < olds.length; i++) {
      var np = map[olds[i]], low = np.toLowerCase();
      var clash = files.some(function (x) { return x.path.toLowerCase() === low && !map[x.path]; }) || seen[low] || allFolders().some(function (d) { return d.toLowerCase() === low; });
      if (clash) { toast('"' + np + '" already exists', 'error'); return; }
      seen[low] = 1;
    }
    syncCurrent();
    var news = olds.map(function (o) { return map[o]; });
    if (olds.length) await snapshot('Before move', olds, news);
    var cp = curPath();
    files.forEach(function (f) { if (map[f.path]) { dropDraft(f.path); f.path = map[f.path]; f.name = base(f.path); } });
    files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    if (vch) vfSet(vf);
    if (typeof currentPagePath !== 'undefined' && map[currentPagePath]) currentPagePath = map[currentPagePath];
    if (olds.length) {
      var rx = new RegExp('(?<![\\w.\\-/])(?:' + olds.slice().sort(function (a, b) { return b.length - a.length; }).map(function (o) { return o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')(?![\\w\\-.])', 'g');
      var hits = files.filter(function (f) { rx.lastIndex = 0; return f.text != null && rx.test(f.text); });
      if (hits.length) {
        var yes = await sure(hits.length + ' file' + (hits.length === 1 ? '' : 's') + ' mention the moved files (like a link or script tag). Update ' + (hits.length === 1 ? 'it' : 'them') + ' to the new location?', { title: 'Update links?', confirmText: 'Update', cancelText: 'Keep as is' });
        if (yes) hits.forEach(function (f) { f.text = f.text.replace(rx, function (m) { return map[m] || m; }); f.size = f.text.length; });
      }
    }
    var open = map[cp] || (files.some(function (f) { return f.path === cp; }) ? cp : '');
    if (!open) { var nx = files.find(function (f) { return f.text != null; }); open = nx ? nx.path : ''; }
    close();
    await finish(open, 'edit', 'Moved ' + olds.length + ' file' + (olds.length === 1 ? '' : 's'), news[0] || '');
    toast('Moved to ' + (dest ? dest.slice(0, -1) : 'project root'), 'success');
  }

  /* ---------- the big card ---------- */
  var bk = null, c = null, view = 'main';
  function close() { if (bk) { bk.remove(); bk = null; c = null; } sel = {}; view = 'main'; }
  function ic(d, col) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  function tile(act, label, col, d, span) {
    return '<button data-act="' + act + '" style="display:flex;align-items:center;gap:10px;padding:14px 12px;border-radius:12px;border:1px solid #2a2b32;background:#1c1d22;color:#fff;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;text-align:left;' + (span ? 'grid-column:span 2;' : '') + '">' + ic(d, col) + '<span>' + label + '</span></button>';
  }
  var ICONS = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'
  };
  function rowHtml(it) {
    var on = !!sel[it.key], d = it.path.split('/').length - 1, nm = base(it.path);
    return '<div data-k="' + esc(it.key) + '" style="display:flex;align-items:center;gap:10px;padding:11px 12px 11px ' + (12 + d * 18) + 'px;border-bottom:1px solid #1d1e24;cursor:pointer">' +
      '<span style="width:20px;height:20px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:1.5px solid ' + (on ? '#f01424' : '#3a3b44') + ';background:' + (on ? '#f01424' : 'transparent') + ';color:#fff">' + (on ? '✓' : '') + '</span>' +
      '<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px;color:' + (it.dir ? '#7ec8ff' : '#fff') + '">' + esc(nm) + (it.dir ? '/' : '') + '</span>' +
      ((it.dir || it.f.text == null) ? '' : '<button data-open="' + esc(it.path) + '" style="flex:none;padding:5px 10px;border-radius:8px;border:1px solid #303139;background:#20222a;color:#a2a3ad;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">Open</button>') +
      '</div>';
  }
  function paintList() {
    var l = $('fmList'), n = $('fmCount'); if (!l) return;
    var list = items();
    l.innerHTML = list.length ? list.map(rowHtml).join('') : '<div style="padding:22px;text-align:center;font-size:13px;color:#a2a3ad">No files yet</div>';
    var k = Object.keys(sel).filter(function (x) { return sel[x]; }).length;
    if (n) n.textContent = k ? k + ' selected' : 'Tap files to select';
  }
  function paintAll() {
    if (!c) return;
    if (view === 'dest') { paintDest(); return; }
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">FILES</div><button data-act="all" style="border:0;background:transparent;color:#7ec8ff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:4px 0">Select all</button></div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0 2px">Project files</div>' +
      '<div id="fmCount" style="font-size:12px;color:#a2a3ad;margin-bottom:10px"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">' +
        tile('file', 'Create text file', '#ff6b75', ICONS.file) +
        tile('folder', 'Create folder', '#7ec8ff', ICONS.folder) +
        tile('move', 'Move', '#ffd166', ICONS.move) +
        tile('del', 'Delete', '#ff6b75', ICONS.trash) +
        tile('save', 'Save file', '#7dd68e', ICONS.save, true) +
      '</div>' +
      '<div id="fmList" style="flex:1;min-height:0;overflow-y:auto;border:1px solid #25262c;border-radius:12px;background:#101115"></div>' +
      '<button data-act="close" style="display:block;width:100%;margin-top:10px;padding:14px;border-radius:12px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:transparent;color:#a2a3ad">Close</button>';
    paintList();
  }
  function paintDest() {
    var fk = selFolders();
    var dests = allFolders().filter(function (d) { return !fk.some(function (k) { return (d + '/').indexOf(k) === 0; }); });
    function btn(attr, label, col) {
      return '<button ' + attr + ' style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:13px 12px;border:0;border-bottom:1px solid #1d1e24;background:transparent;color:' + col + ';font-family:inherit;font-size:13px;cursor:pointer;overflow-wrap:anywhere">' + label + '</button>';
    }
    c.innerHTML =
      '<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">MOVE</div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0 2px">Move to which folder?</div>' +
      '<div style="font-size:12px;color:#a2a3ad;margin-bottom:10px">Tap the destination folder.</div>' +
      '<div style="flex:1;min-height:0;overflow-y:auto;border:1px solid #25262c;border-radius:12px;background:#101115">' +
        btn('data-dest=""', 'Project root', '#fff') +
        dests.map(function (d) { return btn('data-dest="' + esc(d) + '/"', esc(d) + '/', '#7ec8ff'); }).join('') +
        btn('data-act="newdest"', '+ New folder…', '#7dd68e') +
      '</div>' +
      '<button data-act="back" style="display:block;width:100%;margin-top:10px;padding:14px;border-radius:12px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:transparent;color:#a2a3ad">Back</button>';
  }
  async function onTap(e) {
    var t = e.target, o = t.closest('[data-open]');
    if (o) {
      var p = o.getAttribute('data-open'); close();
      var s = $('editorFileSelect'); if (s) { s.value = p; s.dispatchEvent(new Event('change')); }
      return;
    }
    var d = t.closest('[data-dest]');
    if (d) { doMove(d.getAttribute('data-dest')); return; }
    var a = t.closest('[data-act]');
    if (a) {
      var act = a.getAttribute('data-act');
      if (act === 'close') close();
      else if (act === 'file') doCreateFile();
      else if (act === 'folder') doCreateFolder();
      else if (act === 'del') doDelete();
      else if (act === 'save') { close(); $('editorSaveBtn').click(); }
      else if (act === 'all') {
        var every = items().every(function (it) { return sel[it.key]; });
        sel = {}; if (!every) items().forEach(function (it) { sel[it.key] = true; });
        paintList();
      }
      else if (act === 'move') {
        if (!selFiles().length && !selFolders().length) { toast('Select files first', 'error'); return; }
        view = 'dest'; paintDest();
      }
      else if (act === 'back') { view = 'main'; paintAll(); }
      else if (act === 'newdest') {
        var name = await ask('New folder', '', { message: 'Files will move into this new folder', confirmText: 'Create & move' });
        if (name == null) return;
        var n = clean(name);
        if (!n) { toast('That name is not allowed', 'error'); return; }
        doMove(n + '/');
      }
      return;
    }
    var r = t.closest('[data-k]');
    if (r) { toggle(r.getAttribute('data-k')); paintList(); }
  }
  function openCard() {
    if (!pid()) { toast('Open a project first', 'error'); return; }
    if (bk) close();
    sel = {}; view = 'main';
    bk = document.createElement('div');
    bk.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center';
    c = document.createElement('div');
    c.style.cssText = 'width:100%;max-width:560px;height:88vh;display:flex;flex-direction:column;background:#15161a;border:1px solid #2a2b32;border-radius:18px 18px 0 0;padding:16px 16px 20px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff';
    bk.appendChild(c); document.body.appendChild(bk);
    bk.onclick = function (e) { if (e.target === bk) close(); };
    c.addEventListener('click', onTap);
    paintAll();
  }

  /* ---------- the button, right after + ---------- */
  var b = document.createElement('button');
  b.id = 'editorFilesBtn'; b.className = 'editor-btn'; b.title = 'Files'; b.setAttribute('aria-label', 'Files');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  b.onclick = openCard;
  newBtn.insertAdjacentElement('afterend', b);
})();
