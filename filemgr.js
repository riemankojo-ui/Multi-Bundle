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
    list.sort(cmpIt);
    return list;
  }

  /* ---------- selection ---------- */
  var sel = {}, selMode = false, openF = {}, destMode = 'move', lpDone = false, fmDir = '';
  function cmpIt(a, b) {
    var x = a.path.split('/'), y = b.path.split('/'), i = 0;
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    if (i === x.length || i === y.length) return x.length - y.length;
    var ad = i < x.length - 1 || a.dir, bd = i < y.length - 1 || b.dir;
    if (ad !== bd) return ad ? -1 : 1;
    return x[i].localeCompare(y[i]);
  }
  function visible(it) {
    var p = it.path.split('/'), acc = '';
    for (var i = 0; i < p.length - 1; i++) { acc = acc ? acc + '/' + p[i] : p[i]; if (!openF[acc]) return false; }
    return true;
  }
  function repaint() { var l = $('fmList'), st = l ? l.scrollTop : 0; paintAll(); l = $('fmList'); if (l) l.scrollTop = st; }
  function backRow() {
    if (!fmDir) return '';
    return '<div data-back="1" style="display:flex;align-items:center;gap:10px;padding:13px 12px;border-bottom:1px solid #1d1e24;cursor:pointer">' + ic('<polyline points="15 18 9 12 15 6"/>', '#ffffff') + '<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px;font-weight:700;color:#fff">' + esc(fmDir) + '</span></div>';
  }
  function ringThen(ms, fn, hold) {
    if (!bk || !c) return;
    var r = c.getBoundingClientRect();
    var ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;z-index:8;display:flex;align-items:center;justify-content:center;background:#15161a;border-radius:18px 18px 0 0;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    ring.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
    bk.appendChild(ring);
    setTimeout(function () { if (bk) fn(); setTimeout(function () { ring.remove(); }, hold || 200); }, ms);
  }
  function ringThenOld(ms, fn) {
    if (!bk) return;
    var ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    ring.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
    bk.appendChild(ring);
    setTimeout(function () { ring.remove(); if (bk) fn(); }, ms);
  }
  function goDir(path) {
    ringThen(250, function () { fmDir = path; repaint(); var l = $('fmList'); if (l) l.scrollTop = 0; });
  }
  function showCode(path) {
    var f = files.find(function (x) { return x.path === path; });
    if (!f || !bk) return;
    syncCurrent();
    ringThen(250, function () {
      var txt = f.text != null ? f.text : 'This file is not text, so it cannot be shown here.';
      if (txt.length > 200000) txt = txt.slice(0, 200000) + '\n\n... (shortened)';
      var cd = document.createElement('div');
      cd.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 28px);max-width:540px;height:86%;background:#fff;color:#15161a;border-radius:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.6);z-index:6;font-family:system-ui,sans-serif';
      var bs = 'flex:none;padding:7px 12px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;border:1px solid #d5d6dc;background:#f3f4f7;color:#15161a';
      cd.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e3e4e8"><div style="flex:1;min-width:0;font-size:14px;font-weight:800;overflow-wrap:anywhere"></div>' + (f.text != null ? '<button data-cc="edit" style="' + bs + '">Edit</button>' : '') + '<button data-cc="x" style="' + bs + '">Close</button></div><pre style="flex:1;min-height:0;margin:0;padding:12px 14px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre;color:#15161a;-webkit-user-select:text;user-select:text"></pre>';
      cd.firstChild.firstChild.textContent = path;
      cd.lastChild.textContent = txt;
      cd.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cc]'); if (!b) return;
        if (b.getAttribute('data-cc') === 'x') { cd.remove(); return; }
        cd.remove(); close();
        var s3 = $('editorFileSelect'); if (s3) { s3.value = path; s3.dispatchEvent(new Event('change')); }
      });
      bk.appendChild(cd);
    }, 450);
  }
  function showCodeOld(path) {
    var f = files.find(function (x) { return x.path === path; });
    if (!f || !bk) return;
    syncCurrent();
    var ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    ring.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
    bk.appendChild(ring);
    setTimeout(function () {
      ring.remove();
      if (!bk) return;
      var txt = f.text != null ? f.text : 'This file is not text, so it cannot be shown here.';
      if (txt.length > 200000) txt = txt.slice(0, 200000) + '\n\n... (shortened)';
      var cd = document.createElement('div');
      cd.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 28px);max-width:540px;height:86%;background:#fff;color:#15161a;border-radius:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.6);z-index:6;font-family:system-ui,sans-serif';
      var bs = 'flex:none;padding:7px 12px;border-radius:8px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;border:1px solid #d5d6dc;background:#f3f4f7;color:#15161a';
      cd.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e3e4e8"><div style="flex:1;min-width:0;font-size:14px;font-weight:800;overflow-wrap:anywhere"></div>' + (f.text != null ? '<button data-cc="edit" style="' + bs + '">Edit</button>' : '') + '<button data-cc="x" style="' + bs + '">Close</button></div><pre style="flex:1;min-height:0;margin:0;padding:12px 14px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre;color:#15161a;-webkit-user-select:text;user-select:text"></pre>';
      cd.firstChild.firstChild.textContent = path;
      cd.lastChild.textContent = txt;
      cd.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cc]'); if (!b) return;
        if (b.getAttribute('data-cc') === 'x') { cd.remove(); return; }
        cd.remove(); close();
        var s3 = $('editorFileSelect'); if (s3) { s3.value = path; s3.dispatchEvent(new Event('change')); }
      });
      bk.appendChild(cd);
    }, 350);
  }
  function goDest(mode) {
    if (!selFiles().length && !selFolders().length) { toast('Select files first', 'error'); return; }
    ringThen(250, function () { destMode = mode; view = 'dest'; paintDest(); });
  }
  async function doCopy(dest) {
    var chosen = selFiles(), fk = selFolders(), made = [];
    if (!chosen.length) { toast('Select files first', 'error'); return; }
    syncCurrent();
    chosen.forEach(function (f) {
      var p = f.path, top = null;
      fk.forEach(function (k) { if (p.indexOf(k) === 0 && (!top || k.length < top.length)) top = k; });
      var rel = top ? p.slice(top.slice(0, -1).lastIndexOf('/') + 1) : base(p);
      var np = dest + rel;
      if (files.some(function (x) { return x.path === np; })) {
        var dot = np.lastIndexOf('.'), sl = np.lastIndexOf('/');
        var b0 = dot > sl ? np.slice(0, dot) : np, ex = dot > sl ? np.slice(dot) : '', i = 2;
        np = b0 + '-copy' + ex;
        while (files.some(function (x) { return x.path === np; })) np = b0 + '-copy' + (i++) + ex;
      }
      files.push({ path: np, name: base(np), size: f.size, type: f.type, blob: f.blob, text: f.text });
      made.push(np);
    });
    files.sort(function (a, b) { return a.path.localeCompare(b.path); });
    var cp = curPath();
    close();
    await finish(cp, 'new', 'Copied ' + made.length + ' file' + (made.length === 1 ? '' : 's'), made[0] || '');
    toast('Copied to ' + (dest ? dest.slice(0, -1) : 'project root'), 'success');
  }
  function selFolders() { return Object.keys(sel).filter(function (k) { return isDir(k) && sel[k]; }); }
  function selFiles() { return files.filter(function (f) { return sel[f.path]; }); }
  function baseFolder() { var k = selFolders(); return k.length === 1 ? k[0] : (fmDir ? fmDir + '/' : ''); }
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
    var starter = full + '/index.html';
    if (!files.some(function (f) { return f.path.toLowerCase() === starter.toLowerCase(); })) {
      var html = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>New page</title>\n</head>\n<body>\n  <!-- Start your app here -->\n</body>\n</html>\n';
      syncCurrent();
      files.push({ path: starter, name: 'index.html', size: html.length, type: 'text/html', blob: null, text: html });
      files.sort(function (a, b) { return a.path.localeCompare(b.path); });
      close();
      await finish(starter, 'new', 'Created folder', full);
    }
    paintAll();
  }
  async function doDelete() {
    var chosen = selFiles(), fk = selFolders();
    if (!chosen.length && !fk.length) { toast('Select files first', 'error'); return; }
    var msg = chosen.length ? 'Delete ' + chosen.length + ' file' + (chosen.length === 1 ? '' : 's') + (fk.length ? ' and ' + fk.length + ' folder' + (fk.length === 1 ? '' : 's') : '') + '?' : 'Delete ' + fk.length + ' empty folder' + (fk.length === 1 ? '' : 's') + '?';
    var ok = await sure(msg, { title: 'Delete', confirmText: 'Delete', cancelText: 'Cancel' });
    if (!ok) return;
    await new Promise(function (r) { if (!bk || !c) r(); else ringThen(250, r); });
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

  function chosenFiles() { var s = selFiles(); return s.length ? s : files.slice(); }
function dlBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}
function projSafe() { return (typeof currentProjectName === 'function' ? currentProjectName() : 'project').replace(/[^\w\-]+/g, '_'); }
async function doZip() {
  if (!window.JSZip) { toast('ZIP tool did not load. Refresh and try again.', 'error'); return; }
  syncCurrent();
  var list = chosenFiles(), z = new JSZip();
  list.forEach(function (f) { z.file(f.path, f.blob || f.text || ''); });
  dlBlob(await z.generateAsync({ type: 'blob', compression: 'DEFLATE' }), projSafe() + '.zip');
  toast('ZIP ready: ' + list.length + ' file' + (list.length === 1 ? '' : 's'), 'success');
}
function doCopyList() {
  var list = chosenFiles();
  try { navigator.clipboard.writeText(list.map(function (f) { return f.path; }).join('\n')); toast('Copied ' + list.length + ' file name' + (list.length === 1 ? '' : 's'), 'success'); }
  catch (e) { toast('Could not copy', 'error'); }
}
async function doDuplicate() {
  var list = selFiles();
  if (!list.length) { toast('Select files first', 'error'); return; }
  syncCurrent();
  list.forEach(function (f) {
    var dot = f.path.lastIndexOf('.'), sl = f.path.lastIndexOf('/');
    var b = dot > sl ? f.path.slice(0, dot) : f.path, ex = dot > sl ? f.path.slice(dot) : '';
    var np = b + '-copy' + ex, i = 2;
    while (files.some(function (x) { return x.path === np; })) np = b + '-copy' + (i++) + ex;
    files.push({ path: np, name: np.split('/').pop(), size: f.size, type: f.type, blob: f.blob, text: f.text });
  });
  files.sort(function (a, b) { return a.path.localeCompare(b.path); });
  var n = list.length, cp = curPath();
  close();
  await finish(cp, 'new', 'Duplicated ' + n + ' file' + (n === 1 ? '' : 's'), '');
  toast('Duplicated ' + n + ' file' + (n === 1 ? '' : 's'), 'success');
}
function mArr(on) { var s = document.getElementById('fmMoreArr'); if (s) s.style.transform = on ? 'rotate(180deg)' : 'rotate(0deg)'; }
function openMore(btn) {
  var old = document.getElementById('fmMore'); if (old) { old.remove(); mArr(false); return; }
  var r = btn.getBoundingClientRect();
  var ov = document.createElement('div'); ov.id = 'fmMore';
  ov.style.cssText = 'position:fixed;inset:0;z-index:450';
  var card = document.createElement('div');
  card.style.cssText = 'position:absolute;top:' + (r.bottom + 6) + 'px;right:12px;width:230px;background:#1c1d22;border:1px solid #2e2f36;border-radius:14px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:system-ui,sans-serif;color:#fff';
  var items = [
    ['txt', 'Download TXT', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', '#7dd68e'],
    ['zip', 'Download ZIP', '<rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="#6b6e75" stroke="none"/><rect x="9.2" y="5.5" width="2.8" height="2.2" rx=".5" fill="#fff" stroke="none"/><rect x="12" y="8" width="2.8" height="2.2" rx=".5" fill="#fff" stroke="none"/><rect x="9.2" y="10.5" width="2.8" height="2.2" rx=".5" fill="#fff" stroke="none"/><rect x="12" y="13" width="2.8" height="2.2" rx=".5" fill="#fff" stroke="none"/><rect x="9.2" y="15.5" width="2.8" height="2.2" rx=".5" fill="#fff" stroke="none"/>', '#ffd166'],
    ['list', 'Copy file list', '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', '#7ec8ff'],
    ['dup', 'Duplicate', '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>', '#ff6b75']
  ];
  var selN = Object.keys(sel).filter(function (x) { return sel[x]; }).length;
  var menu = btn.getAttribute('data-act') === 'menu';
  if (menu) items = [['folder', 'Create folder', '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>', '#7ec8ff']];
  if (menu && selN) items = [
    ['move', 'Move', '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>', '#ffd166'],
    ['copy', 'Copy', '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', '#7dd68e'],
    ['del', 'Delete', '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', '#ff6b75']
  ].concat(items);
  if (menu) { card.style.right = 'auto'; card.style.left = '12px'; }
  card.innerHTML = items.map(function (it) {
    return '<button data-m="' + it[0] + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 10px;border:0;border-radius:10px;background:transparent;color:#f0f0f2;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">' + ic(it[2], it[3]) + '<span>' + it[1] + '</span></button>';
  }).join('') + '<div style="padding:6px 10px 4px;font-size:11px;color:#8f919b">Uses selected files, or all if none selected.</div>';
  ov.appendChild(card); document.body.appendChild(ov);
  mArr(true); ov.onclick = function (e) { if (e.target === ov) { ov.remove(); mArr(false); } };
  var ACT = { txt: doCreateTxt, zip: doZip, list: doCopyList, dup: doDuplicate, folder: doCreateFolder, move: function () { goDest('move'); }, copy: function () { goDest('copy'); }, del: doDelete };
  card.querySelectorAll('[data-m]').forEach(function (b) {
    b.onclick = function () { ov.remove(); mArr(false); ACT[b.getAttribute('data-m')](); };
  });
}
/* ---------- the big card ---------- */
function doCreateTxt() {
  syncCurrent();
  var pick = selFiles().filter(function (f) { return f.text != null; });
  if (!pick.length) pick = files.filter(function (f) { return f.text != null; });
  if (!pick.length) { toast('No text files to bundle', 'error'); return; }
  var nm = (typeof currentProjectName === 'function' ? currentProjectName() : 'project');
  var out = 'Multi Bundle Export\nProject: ' + nm + '\nFiles: ' + pick.length +
    '\nExported: ' + new Date().toISOString() + '\n' + '='.repeat(60) + '\n\n';
  pick.forEach(function (f) {
    out += '\n' + '='.repeat(60) + '\nFILE: ' + f.path + '\n' + '='.repeat(60) + '\n\n' + f.text + '\n';
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out], { type: 'text/plain' }));
  var pn = nm.replace(/[^\w\-]+/g, '_');
  var one = pick.length === 1 ? pick[0].path.split('/').pop().replace(/[^\w\-.]+/g, '_') : '';
  a.download = pn + (one ? '-' + one : '') + '.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('TXT created with ' + pick.length + ' file' + (pick.length === 1 ? '' : 's'), 'success');
}
  var bk = null, c = null, view = 'main';
  function close() { if (bk) { bk.remove(); bk = null; c = null; } sel = {}; view = 'main'; selMode = false; openF = {}; fmDir = ''; }
  function ic(d, col) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  function tile(act, label, col, d, span) {
    return '<button data-act="' + act + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid #2a2b32;background:#1c1d22;color:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;text-align:left;' + (span ? 'grid-column:span 2;' : '') + '">' + ic(d, col) + '<span>' + label + '</span></button>';
  }
  var ICONS = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    move: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'
  };
  var IC_DIR = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  var IC_FIL = '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/>';
  function rowHtml(it) {
    var on = !!sel[it.key], d = 0, nm = base(it.path), isO = false;
    var box = selMode ? '<span style="width:20px;height:20px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:1.5px solid ' + (on ? '#f01424' : '#3a3b44') + ';background:' + (on ? '#f01424' : 'transparent') + ';color:#fff">' + (on ? '✓' : '') + '</span>' : '';
    var icon = it.dir ? ic(IC_DIR, '#ffffff') : ic(IC_FIL, '#a2a3ad');
    var chev = it.dir ? '<span data-exp="1" style="flex:none;display:flex;padding:6px;transition:transform .2s ease;transform:rotate(' + (isO ? 90 : 0) + 'deg)">' + ic('<polyline points="9 6 15 12 9 18"/>', '#a2a3ad') + '</span>' : '';
    return '<div data-k="' + esc(it.key) + '" style="display:flex;align-items:center;gap:10px;padding:11px 12px 11px ' + (12 + d * 18) + 'px;border-bottom:1px solid #1d1e24;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;' + (on ? 'background:#1c1d22;' : '') + '">' + box + icon + '<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px;color:#fff">' + esc(nm) + '</span>' + chev + '</div>';
  }
  function rowHtmlOld(it) {
    var on = !!sel[it.key], d = it.path.split('/').length - 1, nm = base(it.path);
    return '<div data-k="' + esc(it.key) + '" style="display:flex;align-items:center;gap:10px;padding:11px 12px 11px ' + (12 + d * 18) + 'px;border-bottom:1px solid #1d1e24;cursor:pointer">' +
      '<span style="width:20px;height:20px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:1.5px solid ' + (on ? '#f01424' : '#3a3b44') + ';background:' + (on ? '#f01424' : 'transparent') + ';color:#fff">' + (on ? '✓' : '') + '</span>' +
      '<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px;color:' + (it.dir ? '#7ec8ff' : '#fff') + '">' + esc(nm) + (it.dir ? '/' : '') + '</span>' +
      ((it.dir || it.f.text == null) ? '' : '<button data-open="' + esc(it.path) + '" style="flex:none;padding:5px 10px;border-radius:8px;border:1px solid #303139;background:#20222a;color:#a2a3ad;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer">Open</button>') +
      '</div>';
  }
  function paintList() {
    var l = $('fmList'), n = $('fmCount'); if (!l) return;
    var list = items().filter(function (it) { var pre = fmDir ? fmDir + '/' : ''; return it.path.indexOf(pre) === 0 && it.path.slice(pre.length).indexOf('/') < 0 && it.path !== fmDir; });
    l.innerHTML = backRow() + (list.length ? list.map(rowHtml).join('') : '<div style="padding:22px;text-align:center;font-size:13px;color:#a2a3ad">No files yet</div>');
    var k = Object.keys(sel).filter(function (x) { return sel[x]; }).length;
    if (n) n.textContent = selMode ? k + ' selected' : 'Long press for select';
  }
  function paintAll() {
    if (!c) return;
    if (view === 'dest') { paintDest(); return; }
    c.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">FILES</div><div style="display:flex;gap:8px;align-items:center"><button data-act="menu" aria-label="Menu" style="border:1px solid #303139;background:#1c1d22;color:#fff;border-radius:8px;width:36px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button><button data-act="more" style="border:1px solid #303139;background:#1c1d22;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px">More<svg id="fmMoreArr" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s ease;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg></button></div></div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0 2px"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div id="fmCount" style="font-size:12px;color:#a2a3ad"></div><div style="display:flex;gap:14px;align-items:center"><button data-act="all" style="border:0;background:transparent;color:#7ec8ff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:4px 0">Select all</button>' + (selMode ? '<button data-act="cancelsel" style="border:0;background:transparent;color:#a2a3ad;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:4px 0">Cancel</button>' : '') + '</div></div>' +
      '<div style="display:none">' +
        tile('txt', 'Create TXT', '#ff6b75', ICONS.file) +
        tile('folder', 'Create folder', '#7ec8ff', ICONS.folder) +
        tile('move', 'Move', '#ffd166', ICONS.move) +
        tile('del', 'Delete', '#ff6b75', ICONS.trash) +
      '</div>' +
      '<div id="fmList" style="flex:1;min-height:0;overflow-y:auto;border:1px solid #25262c;border-radius:12px;background:#101115"></div>' +
      '<button data-act="close" style="display:block;width:100%;margin-top:8px;padding:10px;border-radius:10px;font-size:13px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:transparent;color:#a2a3ad">Close</button>';
    paintList();
  }
  function paintDest() {
    var fk = selFolders();
    var dests = allFolders().filter(function (d) { return !fk.some(function (k) { return (d + '/').indexOf(k) === 0; }); });
    function btn(attr, label, col) {
      return '<button ' + attr + ' style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:13px 12px;border:0;border-bottom:1px solid #1d1e24;background:transparent;color:' + col + ';font-family:inherit;font-size:13px;cursor:pointer;overflow-wrap:anywhere">' + label + '</button>';
    }
    c.innerHTML =
      '<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">' + (destMode === 'copy' ? 'COPY' : 'MOVE') + '</div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0 2px">' + (destMode === 'copy' ? 'Copy' : 'Move') + ' to which folder?</div>' +
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
    if (d) { var dv = d.getAttribute('data-dest'); if (destMode === 'copy') doCopy(dv); else doMove(dv); return; }
    var a = t.closest('[data-act]');
    if (a) {
      var act = a.getAttribute('data-act');
      if (act === 'close') {
  var o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:10002;background:#0d0e12;display:flex;align-items:center;justify-content:center';
  o.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
  document.body.appendChild(o);
  setTimeout(function(){
    close();
    o.remove();
  }, 350);
}
      else if (act === 'txt') doCreateTxt(); else if (act === 'more' || act === 'menu') openMore(a); else if (act === 'file') doCreateFile();
      else if (act === 'folder') doCreateFolder();
      else if (act === 'del') doDelete();
      else if (act === 'save') { close(); $('editorSaveBtn').click(); }
      else if (act === 'all') {
        var every = items().every(function (it) { return sel[it.key]; });
        sel = {}; if (!every) items().forEach(function (it) { sel[it.key] = true; }); selMode = !every; repaint(); return;
        paintList();
      }
      else if (act === 'move') {
        if (!selFiles().length && !selFolders().length) { toast('Select files first', 'error'); return; }
        view = 'dest'; paintDest();
      }
      else if (act === 'cancelsel') { sel = {}; selMode = false; repaint(); }
      else if (act === 'back') { ringThen(250, function () { view = 'main'; paintAll(); }); }
      else if (act === 'newdest') {
        var name = await ask('New folder', '', { message: 'Files will move into this new folder', confirmText: 'Create & move' });
        if (name == null) return;
        var n = clean(name);
        if (!n) { toast('That name is not allowed', 'error'); return; }
        if (destMode === 'copy') doCopy(n + '/'); else doMove(n + '/');
      }
      return;
    }
    var r = t.closest('[data-k]'), bkr = t.closest('[data-back]');
    if (bkr) { goDir(fmDir.split('/').slice(0, -1).join('/')); return; }
    if (r) {
      if (lpDone) { lpDone = false; return; }
      var k = r.getAttribute('data-k'), kd = k.slice(0, -1);
      if (t.closest('[data-exp]')) { goDir(kd); return; }
      if (selMode) {
        toggle(k);
        if (!Object.keys(sel).some(function (x) { return sel[x]; })) { selMode = false; repaint(); } else paintList();
        return;
      }
      if (isDir(k)) { goDir(kd); return; }
      showCode(k); return;
      close();
      var s2 = $('editorFileSelect'); if (s2) { s2.value = k; s2.dispatchEvent(new Event('change')); }
    }
  }
  function openCard() {
    if (!pid()) { toast('Open a project first', 'error'); return; }
    if (bk) close();
    sel = {}; view = 'main';
    bk = document.createElement('div');
    bk.style.cssText = 'position:fixed;inset:0;z-index:10002;background:#15161a;display:flex;align-items:stretch;justify-content:center';
c = document.createElement('div');
c.style.cssText = 'width:100%;height:100dvh;display:flex;flex-direction:column;background:#15161a;border:none;border-radius:0;padding:calc(env(safe-area-inset-top, 0px) + 12px) 14px calc(env(safe-area-inset-bottom, 0px) + 14px);box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff';
    bk.appendChild(c); document.body.appendChild(bk);
    bk.onclick = function (e) { if (e.target === bk) close(); };
    c.addEventListener('click', onTap);
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    var lpT = null, lx = 0, ly = 0;
    c.addEventListener('pointerdown', function (e) {
      lpDone = false;
      var r = e.target.closest && e.target.closest('[data-k]');
      if (!r || e.target.closest('[data-exp]')) return;
      lx = e.clientX; ly = e.clientY; clearTimeout(lpT);
      lpT = setTimeout(function () {
        lpDone = true;
        var k = r.getAttribute('data-k');
        if (!selMode) { selMode = true; sel = {}; }
        if (!sel[k]) toggle(k);
        repaint();
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (er) {}
      }, 450);
    });
    c.addEventListener('pointermove', function (e) { if (lpT && (Math.abs(e.clientX - lx) > 10 || Math.abs(e.clientY - ly) > 10)) { clearTimeout(lpT); lpT = null; } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { c.addEventListener(n, function () { clearTimeout(lpT); lpT = null; }); });
    paintAll();
  }

  /* ---------- the button, right after + ---------- */
  var b = document.createElement('button');
  b.id = 'editorFilesBtn'; b.className = 'editor-btn'; b.title = 'Files'; b.setAttribute('aria-label', 'Files');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  b.onclick = openCard;
  newBtn.insertAdjacentElement('afterend', b);
})();
