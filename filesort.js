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
    var S = { sort: 'folders', counts: false, hideNoMatch: true, font: 15, icon: 22 };
    try { var sv = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (sv) for (var k in S) if (sv[k] !== undefined) S[k] = sv[k]; } catch (e) {}
    function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
    S.font = clamp(+S.font || 15, 12, 24); S.icon = clamp(+S.icon || 22, 14, 40);

    /* ---------- "newest" = most recently opened or edited (the app keeps no file dates) ---------- */
    function tkey() { var id = ''; try { id = (typeof currentProjectId !== 'undefined' && currentProjectId) || ''; } catch (e) {} return 'mb_fp_t_' + id; }
    function times() { try { return JSON.parse(localStorage.getItem(tkey()) || '{}') || {}; } catch (e) { return {}; } }
    function stamp(p) { if (!p) return; var t = times(); t[p] = Date.now(); try { localStorage.setItem(tkey(), JSON.stringify(t)); } catch (e) {} }
    sel.addEventListener('change', function () { stamp(sel.value); });
    var ta = document.getElementById('editorTextarea');
    if (ta) { var tm; ta.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { stamp(sel.value); }, 800); }); }

    /* ---------- styles ---------- */
    var st = document.createElement('style');
    st.textContent =
      '#mbFileSheet button.mbfp-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-weight:600;color:#e6e6e8;background:transparent;border:0;border-bottom:1px solid #25262c;border-radius:0;font-family:inherit;line-height:1.3}' +
      '#mbFileSheet button.mbfp-row.on{background:#2a2c34;color:#f5d76e}' +
      '#mbFileSheet button.mbfp-row .mbfp-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#mbFileSheet button.mbfp-row .mbfp-cnt{flex:none;font-size:12px;font-weight:700;color:#a2a3ad;background:#20222a;border:1px solid #303139;border-radius:999px;padding:2px 9px}' +
      '#mbFileSheet button.mbfp-row.dim{opacity:.45}' +
      '.mbfp-menu-btn{margin-left:auto!important}.mbfp-menu-btn+.mbf-search-btn{margin-left:0!important}' +
      '#mbFpMenu{display:none;position:absolute;left:0;right:0;top:0;bottom:0;z-index:6;overflow-y:auto;background:#17181c;padding-bottom:calc(24px + env(safe-area-inset-bottom,0px));overscroll-behavior:contain}' +
      '#mbFpMenu.open{display:block}' +
      '#mbFpMenu .fp-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px;background:#17181c;border-bottom:1px solid #2c2d34}' +
      '#mbFpMenu .fp-head button{display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:#20222a;border:1px solid #303139;border-radius:10px;color:#e6e6e8;cursor:pointer;padding:0}' +
      '#mbFpMenu .fp-head b{font-size:16px;color:#fff}' +
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
      '#mbFpMenu .fp-step span{min-width:34px;text-align:center;font-size:14px;font-weight:800;color:#fff}';
    document.head.appendChild(st);

    /* ---------- icons ---------- */
    function icFolder(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'; }
    function icFile(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#a2a3ad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><polyline points="14 3 14 8 19 8"/></svg>'; }
    function icBack(z) { return '<svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><polyline points="15 18 9 12 15 6"/></svg>'; }
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
        if (j < 0) { if (hit) files.push({ type: 'file', name: rel, path: p, ts: t }); }
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

    function render() {
      if (!bd.classList.contains('open')) return;
      busy = true; mo.disconnect();
      try {
        var fresh = !wasOpen; wasOpen = true;
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
        if (fresh) curDir = '';
        if (lastQ !== null && lastQ === '' && q !== '') curDir = '';   /* a new search starts from the top */
        var qChanged = (lastQ !== q); lastQ = q;
        if (curDir) {
          var bk = mkRow(icBack(S.icon) + '<span class="mbfp-name"></span>', '', function () { ringGo(function () { curDir = curDir.split('/').slice(0, -1).join('/'); render2(true); }, 200); });
          bk.querySelector('.mbfp-name').textContent = curDir; list.appendChild(bk);
        }
        var items = sortItems(buildItems(q)), cur = sel.value, curEl = null;
        items.forEach(function (it) {
          if (it.type === 'folder') {
            var cnt = q ? it.match : it.total;
            var r = mkRow(icFolder(S.icon) + '<span class="mbfp-name"></span>' + (S.counts ? '<span class="mbfp-cnt">' + cnt + '</span>' : ''), (q && !it.match) ? 'dim' : '', function () { ringGo(function () { curDir = it.path; render2(true); }, 200); });
            r.querySelector('.mbfp-name').textContent = it.name; list.appendChild(r);
          } else {
            var on = (!q && it.path === cur);
            var r2 = mkRow(icFile(S.icon) + '<span class="mbfp-name"></span>', on ? 'on' : '', function () { pick(it.path); });
            r2.querySelector('.mbfp-name').textContent = it.name; list.appendChild(r2); if (on) curEl = r2;
          }
        });
        if (!items.length) { var em = document.createElement('div'); em.className = 'mbf-empty'; em.textContent = q ? 'No files match "' + q + '"' : 'No files'; list.appendChild(em); }
        sh.appendChild(list);
        if (fresh && curEl) sh.scrollTop = curEl.offsetTop - sh.clientHeight / 2 + curEl.offsetHeight / 2;
        else if (qChanged) sh.scrollTop = 0;
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
      b.onclick = function (e) { e.stopPropagation(); openMenu(); };
      bar.insertBefore(b, sb);
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
    function buildMenu() {
      if (!menu) { menu = document.createElement('div'); menu.id = 'mbFpMenu'; bd.appendChild(menu); }
      menu.innerHTML = '';
      var head = document.createElement('div'); head.className = 'fp-head';
      var back = document.createElement('button'); back.type = 'button'; back.innerHTML = icBack(20); back.onclick = closeMenu;
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

      var c3 = card('Size');
      c3.appendChild(stepper('File font size', 'font', 12, 24));
      c3.appendChild(stepper('File icon size', 'icon', 14, 40));
      menu.appendChild(c3);
    }
    function openMenu() { buildMenu(); menu.classList.add('open'); menu.scrollTop = 0; }
    function closeMenu() { if (menu) menu.classList.remove('open'); }

    /* ---------- watch the picker ---------- */
    var mo = new MutationObserver(schedule);
    mo.observe(sh, { childList: true });
    new MutationObserver(function () { if (!bd.classList.contains('open')) { wasOpen = false; lastQ = null; closeMenu(); } }).observe(bd, { attributes: true, attributeFilter: ['class'] });
    if (bd.classList.contains('open')) schedule();
  } catch (e) { /* do nothing: the normal picker keeps working */ }
})();
