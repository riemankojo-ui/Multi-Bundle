/* Multi Bundle - File picker menu (3 lines button).
   Adds a menu to the file picker: sort (Folders / Newest / A-Z / Z-A), show total files in folders,
   file font size, file icon size, and hide folders with no match while searching.
   Load AFTER the file picker script in index.html:  <script src="filesort.js"></script>
   Safe by design: if anything fails it does nothing and the normal picker keeps working. */
(function () {
  'use strict';
  try {
    var sel = document.getElementById('editorFileSelect');
    var bd = document.getElementById('mbFileSheetBd');
    var sh = document.getElementById('mbFileSheet');
    if (!sel || !bd || !sh || window.__mbFilesort) return;
    window.__mbFilesort = true;

    /* ---------- settings ---------- */
    var SKEY = 'mb_fp_set';
    var S = { sort: 'folders', counts: false, hideNoMatch: true, font: 15, icon: 22, editFirst: false, showHidden: false };
    try { var sv = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (sv) for (var k in S) if (sv[k] !== undefined) S[k] = sv[k]; } catch (e) {}
    function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    var selMode = false, selSet = {}, lpAt = 0;
    function hkey() { var id = ''; try { id = (typeof currentProjectId !== 'undefined' && currentProjectId) || ''; } catch (e) {} return 'mb_fp_h_' + id; }
    function hidGet() { try { return JSON.parse(localStorage.getItem(hkey()) || '[]') || []; } catch (e) { return []; } }
    function hidSet(a) { try { localStorage.setItem(hkey(), JSON.stringify(a)); } catch (e) {} }
    function isHid(p) { return hidGet().indexOf(p) > -1; }
    S.font = clamp(+S.font || 15, 12, 24); S.icon = clamp(+S.icon || 22, 14, 40);

    /* ---------- "newest" = most recently opened or edited (the app keeps no file dates) ---------- */
    function tkey() { var id = ''; try { id = (typeof currentProjectId !== 'undefined' && currentProjectId) || ''; } catch (e) {} return 'mb_fp_t_' + id; }
    function times() { try { return JSON.parse(localStorage.getItem(tkey()) || '{}') || {}; } catch (e) { return {}; } }
    function stamp(p) { if (!p) return; var t = times(); t[p] = Date.now(); try { localStorage.setItem(tkey(), JSON.stringify(t)); } catch (e) {} }
    sel.addEventListener('change', function () { stamp(sel.value); });
    var ta = document.getElementById('editorTextarea');
    function ekey() { var id = ''; try { id = (typeof currentProjectId !== 'undefined' && currentProjectId) || ''; } catch (e) {} return 'mb_fp_e_' + id; }
    function etimes() { try { return JSON.parse(localStorage.getItem(ekey()) || '{}') || {}; } catch (e) { return {}; } }
    var eTm;
  try { var __fEl = document.getElementById('editorStatus'), __fLast = 0; if (__fEl) new MutationObserver(function () { var tx = (__fEl.textContent || ''); if (tx.charCodeAt(tx.length - 1) !== 8226) return; var nw = Date.now(); if (nw - __fLast < 400) return; __fLast = nw; var p = tx.slice(0, -2); if (!p) return; var t = eGet(); t[p] = nw; try { localStorage.setItem(eKey(), JSON.stringify(t)); } catch (e) {} }).observe(__fEl, { childList: true, characterData: true, subtree: true }); } catch (e) {}
    try { var __sEl = document.getElementById('editorStatus'), __sLast = 0; if (__sEl) new MutationObserver(function () { var tx = (__sEl.textContent || ''); if (tx.charCodeAt(tx.length - 1) !== 8226) return; var nw = Date.now(); if (nw - __sLast < 400) return; __sLast = nw; var p = tx.slice(0, -2); if (!p) return; var t = etimes(); t[p] = nw; try { localStorage.setItem(ekey(), JSON.stringify(t)); } catch (e) {} }).observe(__sEl, { childList: true, characterData: true, subtree: true }); } catch (e) {}
    document.addEventListener('input', function (ev) { if (!ev.target || ev.target.id !== 'editorTextarea') return; clearTimeout(etm); etm = setTimeout(function () { var p = sel.value; if (!p) return; var t = etimes(); t[p] = Date.now(); try { localStorage.setItem(ekey(), JSON.stringify(t)); } catch (e) {} }, 100); }, true);
    if (ta) { var tm; ta.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { stamp(sel.value); }, 800); }); }

    /* ---------- styles ---------- */
    var st = document.createElement('style');
    st.textContent =
      '#mbFileSheet button.mbfp-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-weight:600;color:#e6e6e8;background:transparent;border:0;border-bottom:1px solid #25262c;border-radius:0;font-family:inherit;line-height:1.3}' +
      '#mbFileSheet button.mbfp-row.on{background:#2a2c34;color:#f5d76e}' + '#mbFileSheet button.mbfp-row:last-of-type{border-bottom:2px solid #3a3c46;margin-bottom:12px}' +
      '#mbFileSheet button.mbfp-row .mbfp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#mbFileSheet button.mbfp-row .mbfp-cnt{flex:none;font-size:12px;font-weight:700;color:#a2a3ad;background:#20222a;border:1px solid #303139;border-radius:999px;padding:2px 9px}' +
      '#mbFileSheet button.mbfp-row.dim{opacity:.45}' +
      '.mbf-search-btn:not(.mbfp-menu-btn){margin-left:auto!important}.mbfp-menu-btn{margin-left:0!important}' +
      '#mbFileSheet .mbf-bar{gap:2px!important;padding:0 12px!important;align-items:stretch!important;background:#1e2026!important;border-bottom:3px solid #3a3c46!important;box-shadow:0 2px 5px rgba(0,0,0,.12)!important}' +
      '#mbFileSheet .mbf-bar button:not(.mbf-search-btn){background:transparent!important;border:0!important;border-bottom:2px solid transparent!important;border-radius:0!important;padding:14px 12px 12px!important;color:#8b8c96!important;font-size:14px!important;font-weight:700!important}' +
      '#mbFileSheet .mbf-bar button.on:not(.mbf-search-btn){color:#f5d76e!important;border-bottom-color:#f5d76e!important;background:transparent!important}' +
'#mbFileSheet .mbf-bar button.mbf-search-btn{background:transparent!important;border:0!important;color:#a2a3ad!important;padding:8px!important}' +
'#mbFileSheet:has(.mbf-search-wrap.open) .mbf-bar{display:none!important}' +
'#mbFileSheet .mbf-search-wrap.open{display:flex!important;align-items:center;gap:10px;position:sticky;top:0;z-index:3;padding:12px!important;background:#1e2026!important;border-bottom:3px solid #3a3c46!important}#mbFileSheet .mbf-search-wrap .mbf-search{flex:1;width:auto}' +
'#mbFileSheet .mbf-search-wrap button.mbf-cancel{width:auto!important;flex:none;border:0!important;background:transparent!important;color:#d4d4d9!important;padding:8px!important;display:flex!important;align-items:center;justify-content:center}' +
      '#mbFpMenu{display:none;position:absolute;left:0;right:0;top:0;bottom:0;z-index:6;overflow-y:auto;background:#17181c;padding-bottom:calc(24px + env(safe-area-inset-bottom,0px));overscroll-behavior:contain}' +
      '#mbFpMenu.open{display:block}' +
      '#mbFpMenu .fp-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px;background:#17181c;border-bottom:1px solid #2c2d34}' +
      '#mbFpMenu .fp-head button{display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:transparent;border:0;border-radius:0;color:#d4d4d9;cursor:pointer;padding:0}' +
      '#mbFpMenu .fp-head button svg{stroke-width:3!important;width:26px;height:26px}' +
      '#mbFpMenu .fp-head b{display:none!important}' +
      '#mbFpMenu .fp-head{padding:0 12px!important;min-height:0!important}' +
      '#mbFpMenu .fp-card{margin:14px 12px 0;background:#20222a;border:1px solid #303139;border-radius:14px;overflow:hidden}' +
      '#mbFpMenu .fp-ct{padding:12px 14px 8px;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#8b8c96}' +
      '#mbFpMenu .fp-line{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;box-sizing:border-box;padding:14px;border:0;border-top:1px solid #2c2d34;background:transparent;color:#e6e6e8;font-size:14px;font-weight:600;font-family:inherit;text-align:left;cursor:pointer}' +
      '#mbFpMenu .fp-line small{display:block;margin-top:3px;font-size:11px;font-weight:500;color:#8b8c96}' +
      '#mbFpMenu .fp-line.on{color:#f5d76e}' +
      '#mbFpMenu .fp-chk{flex:none;width:20px;height:20px;color:#f5d76e;display:none}' +
      '#mbFpMenu .fp-line.on .fp-chk{display:block}' +
      '#mbFpMenu .fp-sw{flex:none;position:relative;width:46px;height:26px;border-radius:999px;background:#3a3c46;transition:background .15s}' +
      '#mbFpMenu .fp-sw::after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}' +
      '#mbFpMenu .fp-line.on .fp-sw{background:var(--red,#f01424)}' +
      '#mbFpMenu .fp-line.on .fp-sw::after{transform:translateX(20px)}' +
      '#mbFpMenu .fp-step{flex:none;display:flex;align-items:center;gap:6px}' +
      '#mbFpMenu .fp-step button{width:38px;height:38px;border-radius:10px;border:1px solid #303139;background:#17181c;color:#fff;font-size:20px;font-weight:700;cursor:pointer;font-family:inherit;padding:0}' +
      '#mbFpMenu .fp-step span{min-width:34px;text-align:center;font-size:14px;font-weight:800;color:#fff}' +
      '#modalRoot{z-index:10010!important}' +
      '#mbFpRest{display:none;position:absolute;left:0;right:0;top:0;bottom:0;z-index:7;overflow-y:auto;background:#17181c;padding-bottom:calc(24px + env(safe-area-inset-bottom,0px))}' +
      '#mbFpRest.open{display:block}' +
      '#mbFpRest .rs-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;height:60px;padding:0 8px;background:#1e2026;border-bottom:3px solid #3a3c46}' +
      '#mbFpRest .rs-head button{display:flex;align-items:center;justify-content:center;height:44px;padding:0 12px;background:transparent;border:0;color:#a9abb5;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer}' +
      '#mbFpRest .rs-row{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;text-align:left;font-weight:600;color:#e6e6e8;background:transparent;border:0;border-bottom:1px solid #25262c;font-family:inherit;cursor:pointer}' +
      '#mbFpRest .rs-row .rs-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#mbFpRest .rs-row small{display:block;font-size:11px;font-weight:500;color:#8b8c96;margin-top:2px}' +
      '#mbFpRest .rs-row .rs-go{flex:none;font-size:12px;font-weight:700;color:#a9abb5;border:1px solid #303139;border-radius:999px;padding:4px 10px}' +
      '#mbFpRest .rs-empty{padding:28px 16px;text-align:center;font-size:14px;color:#8b8c96}' +
      '#mbFileSheet .mbf-bar,#mbFileSheet .mbfp-selbar,#mbFileSheet .mbf-search-wrap.open{height:60px!important;min-height:60px!important;box-sizing:border-box!important}' +
      '#mbFileSheet .mbf-bar{align-items:stretch!important}' +
      '#mbFileSheet .mbf-bar button:not(.mbf-search-btn){display:flex!important;align-items:center!important;padding-top:0!important;padding-bottom:0!important}' +
      '#mbFileSheet .mbf-bar button.mbf-search-btn{height:auto!important;align-self:center!important;padding:10px!important}' +
      '#mbFileSheet .mbf-search-wrap.open{padding:0 12px!important;align-items:center!important}' +
      '#mbFileSheet .mbfp-selbar{align-items:center!important}' +
      '#mbFileSheet .mbfp-selbar{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:4px;padding:6px 8px;background:#1e2026;border-bottom:3px solid #3a3c46}' +
      '#mbFileSheet.mbsel .mbf-bar{display:none!important}' +
      '#mbFileSheet .mbfp-selbar .mbfp-ib{display:flex!important;align-items:center;justify-content:center;width:46px!important;height:46px;padding:0!important;border:0!important;border-radius:12px!important;background:transparent!important;color:#a9abb5!important}' +
      '#mbFileSheet .mbfp-selbar .mbfp-ib:active{background:#2a2c34!important}' +
      '#mbFileSheet .mbfp-selbar .mbfp-ib.del{color:#a9abb5!important}' +
      '#mbFileSheet .mbfp-selbar .mbfp-cnt2{flex:1;text-align:center;font-size:14px;font-weight:800;color:#f5d76e}' +
      '#mbFileSheet .mbfp-ck{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid #4a4c56;display:grid;place-items:center;color:#fff;font-size:13px;font-weight:800}' +
      '#mbFileSheet .mbfp-ck.on{background:transparent;border-color:#a9abb5;color:#e6e6e8}' +
      '#mbFileSheet .mbfp-selbar .mbfp-ib.del{order:1}' +
      '#mbFileSheet .mbfp-selbar .mbfp-ib.hd{order:2}';
    document.head.appendChild(st);

    /* ---------- icons ---------- */
    function icFolder(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'; }
    function icFile(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>'; }
    function icBack(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#a2a3ad" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><polyline points="15 18 9 12 15 6"/></svg>'; }
    var IC_MENU = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    var IC_CHK = '<svg class="fp-chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

    /* ---------- state ---------- */
    var curDir = '', lastQ = null, wasOpen = false, busy = false, pending = false, menu = null;
    var nameCmp = function (a, b) { return String(a).toLowerCase().localeCompare(String(b).toLowerCase(), undefined, { numeric: true }); };

    function allPaths() { var o = []; for (var i = 0; i < sel.options.length; i++) { var v = sel.options[i].value; if (v) o.push(v); } return o; }
    function isLogosMode() { var b = sh.querySelectorAll('.mbf-bar button'); return !!(b[1] && /\bon\b/.test(b[1].className)); }
    function closeSheet() { bd.classList.remove('open'); var a = document.getElementById('mbSelArr'); if (a) a.style.transform = 'rotate(0deg)'; }
    /* same spinner the picker always showed while a file or folder opens */
    function ringGo(fn, ms) {
      var ov = document.getElementById('mbRing');
      if (!ov) {
        ov = document.createElement('div'); ov.id = 'mbRing';
        ov.style.cssText = 'position:fixed;left:0;right:0;z-index:10001;background:#17181c;display:none;align-items:center;justify-content:center';
        ov.innerHTML = '<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';
        document.body.appendChild(ov);
      }
      ov.style.top = '0'; ov.style.bottom = '0'; ov.style.zIndex = '10003'; ov.style.display = 'flex';
      requestAnimationFrame(function () { requestAnimationFrame(function () { fn(); requestAnimationFrame(function () { setTimeout(function () { ov.style.display = 'none'; }, ms || 350); }); }); });
    }
    function pick(path) { ringGo(function () { pick0(path); }, 450); }
    function pick0(path) {
      closeSheet(); window.__edSkipRestore = Date.now() + 1500;
      setTimeout(function () { if (sel.value !== path) { sel.value = path; sel.dispatchEvent(new Event('change', { bubbles: true })); } }, 0);
    }

    /* ---------- the list ---------- */
    function buildItems(q) {
      var prefix = curDir ? curDir + '/' : '', tt = times(), folders = {}, files = [], paths = allPaths();
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        if (prefix && p.indexOf(prefix) !== 0) continue;
        var rel = p.slice(prefix.length), hit = !q || p.toLowerCase().indexOf(q) > -1, t = tt[p] || 0, j = rel.indexOf('/');
        if (j < 0) { if (hit && (S.showHidden || !isHid(p))) files.push({ type: 'file', name: rel, path: p, ts: t }); }
        else {
          var fn = rel.slice(0, j), f = folders[fn] || (folders[fn] = { type: 'folder', name: fn, path: prefix + fn, total: 0, match: 0, ts: 0 });
          f.total++; if (hit) f.match++; if (t > f.ts) f.ts = t;
        }
      }
      var fl = [];
      for (var n in folders) { var f2 = folders[n]; if (q && S.hideNoMatch && f2.match === 0) continue; fl.push(f2); }
      return { folders: fl, files: files };
    }
    function sortItems(d) {
      var r = sortItems0(d); if (!S.editFirst) return r;
      var et = etimes();
      return r.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { var ta2 = a.x.type === 'folder' ? 0 : (et[a.x.path] || 0), tb2 = b.x.type === 'folder' ? 0 : (et[b.x.path] || 0); return (tb2 - ta2) || (a.i - b.i); }).map(function (o) { return o.x; });
    }
    function sortItems0(d) {
      var byName = function (a, b) { return nameCmp(a.name, b.name); };
      if (S.sort === 'folders') return d.folders.sort(byName).concat(d.files.sort(byName));
      var all = d.folders.concat(d.files);
      if (S.sort === 'az') return all.sort(byName);
      if (S.sort === 'za') return all.sort(function (a, b) { return byName(b, a); });
      return all.sort(function (a, b) { return (b.ts - a.ts) || byName(a, b); });   // newest
    }
    function rowPad() { return Math.max(10, Math.round(S.icon * 0.5)); }
    function mkRow(html, cls, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mbfp-row' + (cls ? ' ' + cls : '');
      b.style.fontSize = S.font + 'px'; b.style.padding = rowPad() + 'px 16px'; b.innerHTML = html; b.onclick = fn; return b;
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    var viewFiles = [];
    function selPaths() { return Object.keys(selSet).filter(function (k) { return selSet[k]; }); }
    function selFilePaths() { var out = {}, all = allPaths(); selPaths().forEach(function (k) { if (k.slice(-1) === '/') all.forEach(function (p) { if (p.indexOf(k) === 0) out[p] = 1; }); else out[k] = 1; }); return Object.keys(out); }
    function sToast(m, t) { if (window.showToast) window.showToast(m, t); }
    function exitSel() { selMode = false; selSet = {}; render(); }
    function toggleSel(p) { if (selSet[p]) delete selSet[p]; else selSet[p] = true; if (!selPaths().length) selMode = false; render(); }
    function attachLP(el, path) {
      var t = null, x = 0, y = 0;
      el.addEventListener('touchstart', function (e) {
        var p = e.touches[0]; x = p.clientX; y = p.clientY; clearTimeout(t);
        t = setTimeout(function () {
          lpAt = Date.now();
          if (!selMode) { selMode = true; selSet = {}; }
          selSet[path] = true;
          try { if (navigator.vibrate) navigator.vibrate(30); } catch (_) {}
          render();
        }, 450);
      }, { passive: true });
      el.addEventListener('touchmove', function (e) { var p = e.touches[0]; if (Math.abs(p.clientX - x) > 10 || Math.abs(p.clientY - y) > 10) clearTimeout(t); }, { passive: true });
      ['touchend', 'touchcancel'].forEach(function (n) { el.addEventListener(n, function () { clearTimeout(t); }); });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    function icBtn(svg, label, cls, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mbfp-ib' + (cls ? ' ' + cls : '');
      b.setAttribute('aria-label', label); b.innerHTML = svg;
      b.onclick = function (e) { e.stopPropagation(); fn(); }; return b;
    }
    function doSelAll() {
      var all = viewFiles.length && viewFiles.every(function (p) { return selSet[p]; });
      viewFiles.forEach(function (p) { if (all) delete selSet[p]; else selSet[p] = true; });
      if (!selPaths().length) selMode = false;
      render();
    }
    function doHide() {
      var ps = selFilePaths(), h = hidGet(), allH = ps.every(function (p) { return h.indexOf(p) > -1; });
      if (allH) h = h.filter(function (p) { return ps.indexOf(p) < 0; });
      else ps.forEach(function (p) { if (h.indexOf(p) < 0) h.push(p); });
      hidSet(h);
      sToast((allH ? 'Unhid ' : 'Hid ') + ps.length + ' file' + (ps.length === 1 ? '' : 's'), 'success');
      exitSel();
    }
    async function doDel() {
      var ps = selFilePaths(); if (!ps.length) return;
      if (!window.__edDeletePaths) { sToast('Delete is not ready', 'error'); return; }
      var ok = window.showConfirm ? await window.showConfirm('Delete ' + ps.length + ' file' + (ps.length === 1 ? '' : 's') + '? A backup snapshot is saved first.', { title: 'Delete files', confirmText: 'Delete', cancelText: 'Cancel' }) : true;
      if (!ok) return;
      await window.__edDeletePaths(ps);
      sToast('Deleted ' + ps.length, 'success');
      exitSel();
    }
    function buildSelBar() {
      var d = document.createElement('div'); d.className = 'mbfp-selbar';
      var S1 = 'width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
      var allOn = viewFiles.length && viewFiles.every(function (p) { return selSet[p]; });
      d.appendChild(icBtn('<svg ' + S1 + '><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="8 12 11 15 16 9"' + (allOn ? '' : ' opacity=".45"') + '/></svg>', 'Select all', '', doSelAll));
      var c = document.createElement('div'); c.className = 'mbfp-cnt2'; d.appendChild(c);
      var h = hidGet(), ps = selFilePaths(), allH = ps.length && ps.every(function (p) { return h.indexOf(p) > -1; });
      d.appendChild(icBtn(allH
        ? '<svg ' + S1 + '><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg ' + S1 + '><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>', allH ? 'Unhide' : 'Hide', 'hd', doHide));
      d.appendChild(icBtn('<svg ' + S1 + '><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>', 'Delete', 'del', doDel));
      return d;
    }
    function render() {
      if (!bd.classList.contains('open')) return;
      busy = true; mo.disconnect();
      try {
        var fresh = !wasOpen; wasOpen = true; var keepTop = sh.scrollTop;
        var list = document.getElementById('mbfpList');
        if (isLogosMode()) { if (list) list.remove(); return; }
        ensureMenuBtn();
        /* take over the rows: remove the picker's own rows, keep its bar and search box */
        [].slice.call(sh.children).forEach(function (c) {
          if (c === list || c.classList.contains('mbf-bar') || c.classList.contains('mbf-search-wrap')) return;
          c.remove();
        });
        if (!list) { list = document.createElement('div'); list.id = 'mbfpList'; }
        list.innerHTML = '';
        var inp = document.getElementById('mbFileSearch');
        var q = ((inp && inp.value) || '').toLowerCase().trim();
 if (curDir && !allPaths().some(function (p) { return p.indexOf(curDir + '/') === 0; })) curDir = '';
        if (lastQ !== null && lastQ === '' && q !== '') curDir = '';   /* a new search starts from the top */
        var qChanged = (lastQ !== q); lastQ = q;
        if (curDir) {
          var bk = mkRow(icBack(S.icon) + '<span class="mbfp-name"></span>', '', function () { ringGo(function () { curDir = curDir.split('/').slice(0, -1).join('/'); render2(true); }, 200); });
          bk.querySelector('.mbfp-name').textContent = curDir; list.appendChild(bk);
        }
        var items = sortItems(buildItems(q)), cur = sel.value, curEl = null;
        viewFiles = items.map(function (i) { return i.type === 'folder' ? i.path + '/' : i.path; });
        sh.classList.toggle('mbsel', selMode);
        if (selMode) sh.insertBefore(buildSelBar(), sh.firstChild);
        items.forEach(function (it) {
          if (it.type === 'folder') {
            var cnt = q ? it.match : it.total;
            var fk = it.path + '/';
            var fchk = selMode ? '<span class="mbfp-ck' + (selSet[fk] ? ' on' : '') + '">' + (selSet[fk] ? '&#10003;' : '') + '</span>' : '';
var r = mkRow(fchk + icFolder(S.icon) + '<span class="mbfp-name"></span>' + (S.counts ? '<span class="mbfp-cnt">' + cnt + '</span>' : ''), ((q && !it.match) ? 'dim' : '') + ((!selMode && !q && cur && cur.indexOf(fk) === 0) ? ' on' : ''), function () {
              if (Date.now() - lpAt < 700) return;
              if (selMode) { toggleSel(fk); return; }
              ringGo(function () { curDir = it.path; render2(true); }, 200);
            });
            attachLP(r, fk);
            r.querySelector('.mbfp-name').textContent = it.name; list.appendChild(r);
          } else {
            var on = (!selMode && !q && it.path === cur);
            var chk = selMode ? '<span class="mbfp-ck' + (selSet[it.path] ? ' on' : '') + '">' + (selSet[it.path] ? '&#10003;' : '') + '</span>' : '';
            var r2 = mkRow(chk + icFile(S.icon) + '<span class="mbfp-name"></span>', (on ? 'on' : '') + (isHid(it.path) ? ' dim' : ''), function () {
              if (Date.now() - lpAt < 700) return;
              if (selMode) { toggleSel(it.path); return; }
              if (isHid(it.path)) { sToast('Hidden file. Restore it to edit.'); return; }
              pick(it.path);
            });
            attachLP(r2, it.path);
            r2.querySelector('.mbfp-name').textContent = it.name; list.appendChild(r2); if (on) curEl = r2;
          }
        });
        if (!items.length) { var em = document.createElement('div'); em.className = 'mbf-empty'; em.textContent = q ? 'No files match "' + q + '"' : 'No files'; list.appendChild(em); }
        sh.appendChild(list);
        if (fresh && S.editFirst) sh.scrollTop = 0; else if (fresh && curEl) sh.scrollTop = curEl.offsetTop - sh.clientHeight / 2 + curEl.offsetHeight / 2;
        else if (qChanged) sh.scrollTop = 0;
        else sh.scrollTop = keepTop;
      } catch (e) { /* never break the picker */ }
      finally { mo.observe(sh, { childList: true }); busy = false; }
    }
    function render2(top) { render(); if (top) sh.scrollTop = 0; }
    function schedule() { if (busy || pending) return; pending = true; Promise.resolve().then(function () { pending = false; render(); }); }

    /* ---------- the 3 lines button + menu ---------- */
    function ensureMenuBtn() {
      var bar = sh.querySelector('.mbf-bar'); if (!bar || bar.querySelector('.mbfp-menu-btn')) return;
      var sb = bar.querySelector('.mbf-search-btn'); if (!sb) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mbf-search-btn mbfp-menu-btn'; b.setAttribute('aria-label', 'List settings'); b.innerHTML = IC_MENU;
      b.onclick = function (e) { e.stopPropagation(); ringGo(openMenu, 300); };
      bar.insertBefore(b, sb.nextSibling);
      var bk = document.createElement('button'); bk.type = 'button'; bk.className = 'mbf-search-btn mbfp-menu-btn'; bk.setAttribute('aria-label', 'Back'); bk.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>';
      bk.onclick = function (e) { e.stopPropagation(); ringGo(function () { bd.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, 300); };
      bar.insertBefore(bk, b.nextSibling);
    }
    function line(label, sub, on, kind, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'fp-line' + (on ? ' on' : '');
      b.innerHTML = '<span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (kind === 'chk' ? IC_CHK : '<span class="fp-sw"></span>');
      b.onclick = fn; return b;
    }
    function card(title) { var c = document.createElement('div'); c.className = 'fp-card'; var t = document.createElement('div'); t.className = 'fp-ct'; t.textContent = title; c.appendChild(t); return c; }
    function stepper(label, key, min, max) {
      var l = document.createElement('div'); l.className = 'fp-line'; l.style.cursor = 'default';
      l.innerHTML = '<span>' + label + '</span><span class="fp-step"><button type="button" data-d="-1">&minus;</button><span>' + S[key] + '</span><button type="button" data-d="1">+</button></span>';
      [].forEach.call(l.querySelectorAll('button'), function (bt) {
        bt.onclick = function (e) { e.stopPropagation(); S[key] = clamp(S[key] + (+bt.getAttribute('data-d')), min, max); save(); l.querySelector('.fp-step span').textContent = S[key]; render(); };
      });
      return l;
    }
    function openRestore() {
      var pg = document.getElementById('mbFpRest');
      if (!pg) { pg = document.createElement('div'); pg.id = 'mbFpRest'; bd.appendChild(pg); }
      function draw() {
        var have = allPaths(), list = hidGet().filter(function (p) { return have.indexOf(p) > -1; }).sort(nameCmp);
        pg.innerHTML = '';
        var head = document.createElement('div'); head.className = 'rs-head';
        var back = document.createElement('button'); back.type = 'button'; back.innerHTML = icBack(22);
        back.onclick = function () { ringGo(function () { pg.classList.remove('open'); render(); }, 300); };
        head.appendChild(back);
        if (list.length > 1) {
          var all = document.createElement('button'); all.type = 'button'; all.textContent = 'Restore all';
          all.onclick = function () { hidSet(hidGet().filter(function (p) { return list.indexOf(p) < 0; })); draw(); };
          head.appendChild(all);
        }
        pg.appendChild(head);
        if (!list.length) { var em = document.createElement('div'); em.className = 'rs-empty'; em.textContent = 'No hidden files'; pg.appendChild(em); return; }
        list.forEach(function (p) {
          var i = p.lastIndexOf('/'), nm = p.slice(i + 1), dir = i > -1 ? p.slice(0, i) : '';
          var b = document.createElement('button'); b.type = 'button'; b.className = 'rs-row';
          b.style.fontSize = S.font + 'px'; b.style.padding = rowPad() + 'px 16px';
          b.innerHTML = icFile(S.icon) + '<span class="rs-nm"></span><span class="rs-go">Restore</span>';
          var s = b.querySelector('.rs-nm'); s.textContent = nm;
          if (dir) { var sm = document.createElement('small'); sm.textContent = dir; s.appendChild(sm); }
          b.onclick = function () { hidSet(hidGet().filter(function (x) { return x !== p; })); draw(); };
          pg.appendChild(b);
        });
      }
      draw(); pg.classList.add('open'); pg.scrollTop = 0;
    }
    function buildMenu() {
      if (!menu) { menu = document.createElement('div'); menu.id = 'mbFpMenu'; bd.appendChild(menu); }
      menu.innerHTML = '';
      var head = document.createElement('div'); head.className = 'fp-head';
      var back = document.createElement('button'); back.type = 'button'; back.innerHTML = icBack(20); back.onclick = function () { ringGo(closeMenu, 300); };
      var ttl = document.createElement('b'); ttl.textContent = 'File list settings';
      head.appendChild(back); head.appendChild(ttl); menu.appendChild(head);

      var c1 = card('Sort by');
      [['folders', 'Folders', 'Folders first, then files'], ['newest', 'Newest', 'Recently opened or edited first'], ['az', 'A - Z', ''], ['za', 'Z - A', '']].forEach(function (o) {
        c1.appendChild(line(o[1], o[2], S.sort === o[0], 'chk', function () { S.sort = o[0]; save(); buildMenu(); render(); }));
      });
      menu.appendChild(c1);

      var c2 = card('Folders');
      c2.appendChild(line('Show total files in folder', 'A number on each folder', S.counts, 'sw', function () { S.counts = !S.counts; save(); buildMenu(); render(); }));
      c2.appendChild(line('Hide folders with no match', 'While searching, only folders that have a match', S.hideNoMatch, 'sw', function () { S.hideNoMatch = !S.hideNoMatch; save(); buildMenu(); render(); }));
      menu.appendChild(c2);

      var c4 = card('Edited files');
      c4.appendChild(line('Edited file goes first', 'The file you edit moves to the top of the list', S.editFirst, 'sw', function () { S.editFirst = !S.editFirst; save(); buildMenu(); render(); }));
      menu.appendChild(c4);
      var c3 = card('Size');
      c3.appendChild(stepper('File font size', 'font', 12, 24));
      c3.appendChild(stepper('File icon size', 'icon', 14, 40));
      menu.appendChild(c3);
      var c5 = card('Hidden files'); c5.appendChild(line('Show hidden files', 'Hidden files appear faded in the list', S.showHidden, 'sw', function () { S.showHidden = !S.showHidden; save(); buildMenu(); render(); })); var have6 = allPaths(), n6 = hidGet().filter(function (p) { return have6.indexOf(p) > -1; }).length;
      var rb = line('Restore files', n6 + ' hidden file' + (n6 === 1 ? '' : 's'), false, 'chk', function () { ringGo(openRestore, 300); });
      rb.removeChild(rb.lastChild);
      var ch6 = document.createElement('span'); ch6.innerHTML = '&#8250;'; ch6.style.cssText = 'font-size:26px;color:#8b8c96;flex:none'; rb.appendChild(ch6);
      c5.appendChild(rb);
      menu.appendChild(c5);
    }
    function openMenu() { buildMenu(); menu.classList.add('open'); menu.scrollTop = 0; }
    function closeMenu() { if (menu) menu.classList.remove('open'); var rp = document.getElementById('mbFpRest'); if (rp) rp.classList.remove('open'); }

    /* ---------- watch the picker ---------- */
    var mo = new MutationObserver(schedule);
    mo.observe(sh, { childList: true });
    new MutationObserver(function () { if (!bd.classList.contains('open')) { wasOpen = false; lastQ = null; closeMenu(); selMode = false; selSet = {}; sh.classList.remove('mbsel'); } }).observe(bd, { attributes: true, attributeFilter: ['class'] });
    if (bd.classList.contains('open')) schedule();
  } catch (e) { /* do nothing: the normal picker keeps working */ }
})();
