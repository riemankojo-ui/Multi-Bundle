/* Multi Bundle - editor settings: a gear button right before Save with 3 switches (Limit lines, Line numbers, Keep screen on). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('editorTextarea'), shell = $('editorShell'), gutter = $('editorGutter'), save = $('editorSaveBtn');
  if (!ta || !shell || !gutter || !save || $('editorSettingsBtn')) return;
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} }
  var S = { wrap: get('mb_ed_wrap', false), ln: get('mb_ed_ln', true), awake: get('mb_ed_awake', false) };

  /* ---------- Limit lines ---------- */
  var mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;margin:0;padding:0;border:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal';
  document.body.appendChild(mirror);
  var cache = { v: null, k: '', out: '' };

  function rowsFor(lines) {
    var cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 20;
    var w = ta.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (w <= 0) return null;
    var ms = mirror.style;
    ms.width = w + 'px'; ms.fontFamily = cs.fontFamily; ms.fontSize = cs.fontSize; ms.lineHeight = cs.lineHeight; ms.tabSize = cs.tabSize; ms.letterSpacing = cs.letterSpacing;
    mirror.textContent = '';
    var probe = document.createElement('span');
    probe.style.whiteSpace = 'pre'; probe.textContent = new Array(51).join('x');
    mirror.appendChild(probe);
    var cw = probe.getBoundingClientRect().width / 50 || 8;
    mirror.removeChild(probe);
    var cap = Math.floor(w / cw) - 1, tab = new Array((parseInt(cs.tabSize, 10) || 2) + 1).join(' ');
    var rows = new Array(lines.length), long = [], i, L, len;
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      len = L.indexOf('\t') < 0 ? L.length : L.replace(/\t/g, tab).length;
      if (len <= cap && !/[^\x00-\x7f]/.test(L)) rows[i] = 1; else long.push(i);
    }
    var els = long.map(function (idx) {
      var d = document.createElement('div'); d.textContent = lines[idx] || ' '; mirror.appendChild(d); return d;
    });
    els.forEach(function (d, j) { rows[long[j]] = Math.max(1, Math.round(d.getBoundingClientRect().height / lh)); });
    mirror.textContent = '';
    return rows;
  }

  function plainGutter() {
    var n = ta.value.split('\n').length, s = '', i;
    for (i = 1; i <= n; i++) s += i + '\n';
    if (gutter.textContent !== s) gutter.textContent = s;
    gutter.scrollTop = ta.scrollTop;
  }
  function wrapGutter() {
    var v = ta.value, key = ta.clientWidth + '|' + getComputedStyle(ta).fontSize, out;
    if (cache.v === v && cache.k === key) out = cache.out;
    else {
      var lines = v.split('\n'), rows = rowsFor(lines);
      if (!rows) return;
      var parts = [], i, r;
      for (i = 0; i < lines.length; i++) { parts.push(i + 1); for (r = 1; r < rows[i]; r++) parts.push(''); }
      out = parts.join('\n') + '\n';
      cache = { v: v, k: key, out: out };
    }
    if (gutter.textContent !== out) gutter.textContent = out;
    gutter.scrollTop = ta.scrollTop;
  }
  var raf = 0;
  function sched() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      if (ta.clientWidth > 0) setTimeout(function () { document.documentElement.classList.remove('mb-boot'); }, 60);
      raf = 0;
      if (!S.ln) return;
      if (S.wrap) wrapGutter(); else plainGutter();
    });
  }
  function applyWrap() {
    shell.classList.toggle('mb-wrap', S.wrap); document.documentElement.classList.toggle('mb-wrap', S.wrap);
    ta.setAttribute('wrap', S.wrap ? 'soft' : 'off');
    ta.scrollLeft = 0;
    var hl = $('editorHighlight'); if (hl) hl.scrollLeft = 0;
    sched();
  }
  function applyLn() { shell.classList.toggle('mb-noln', !S.ln); document.documentElement.classList.toggle('mb-noln', !S.ln); sched(); }
  window.__mbWrapRow = function (idx) {
    if (!S.wrap) return null;
    var cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 20;
    var w = ta.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (w <= 0) return null;
    var ms = mirror.style;
    ms.width = w + 'px'; ms.fontFamily = cs.fontFamily; ms.fontSize = cs.fontSize; ms.lineHeight = cs.lineHeight; ms.tabSize = cs.tabSize; ms.letterSpacing = cs.letterSpacing;
    mirror.textContent = ta.value.slice(0, idx) + '\u200b';
    var rows = Math.round(mirror.getBoundingClientRect().height / lh);
    mirror.textContent = '';
    return Math.max(1, rows);
  };

  new MutationObserver(function () {
    if (S.wrap && S.ln && gutter.textContent !== cache.out) wrapGutter();
  }).observe(gutter, { childList: true, characterData: true, subtree: true });
  ta.addEventListener('input', sched);
  ta.addEventListener('keyup', sched);
  window.addEventListener('resize', sched);
  if (window.ResizeObserver) new ResizeObserver(function () { if (!S.ln) return; if (S.wrap) wrapGutter(); else plainGutter(); }).observe(ta);
  var pg = $('editorPage');
  if (pg) new MutationObserver(sched).observe(pg, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(sched).observe(shell, { attributes: true, attributeFilter: ['style'] });

  /* ---------- Keep screen on ---------- */
  var wl = null;
  function lock() {
    if (!navigator.wakeLock) return Promise.reject(new Error('unsupported'));
    return navigator.wakeLock.request('screen').then(function (l) {
      wl = l; l.addEventListener('release', function () { if (wl === l) wl = null; });
    });
  }
  function unlock() { var l = wl; wl = null; if (l) { try { l.release(); } catch (e) {} } }
  document.addEventListener('visibilitychange', function () {
    if (S.awake && !wl && document.visibilityState === 'visible') lock().catch(function () {});
  });

  /* ---------- gear button and card ---------- */
  var GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var btn = document.createElement('button');
  btn.id = 'editorSettingsBtn'; btn.className = 'editor-btn'; btn.title = 'Editor settings'; btn.setAttribute('aria-label', 'Editor settings');
  btn.innerHTML = GEAR;
  save.parentNode.insertBefore(btn, save);

  function row(k, t, d) {
    return '<button type="button" class="es-row" data-k="' + k + '"><span class="es-txt"><b>' + t + '</b><small>' + d + '</small></span><i class="es-sw"></i></button>';
  }
  var card = document.createElement('div');
  card.id = 'editorSettingsCard'; card.className = 'ed-set-card';
  card.innerHTML = '<div class="es-ttl">Editor settings</div>' +
    row('wrap', 'Limit lines', 'Long lines wrap, nothing goes under the right side') +
    row('ln', 'Line numbers', 'Show the numbers on the left') +
    row('awake', 'Keep screen on', 'Screen stays awake while you code');
  document.body.appendChild(card);

  function paint() {
    Array.prototype.forEach.call(card.querySelectorAll('.es-row'), function (b) { b.classList.toggle('on', !!S[b.getAttribute('data-k')]); });
  }
  var moved = false;
  function place() {
    if (moved) return;
    var r = btn.getBoundingClientRect(), w = card.offsetWidth || 250;
    card.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    card.style.top = (r.bottom + 8) + 'px';
  }
  function closeCard() { card.classList.remove('open'); }
  btn.addEventListener('click', function () {
    if (card.classList.contains('open')) return closeCard();
    paint(); card.classList.add('open'); place();
  });
  document.addEventListener('click', function (e) { if (!card.contains(e.target) && !btn.contains(e.target)) closeCard(); });
  window.addEventListener('resize', function () { closeCard(); moved = false; });

  card.addEventListener('click', function (e) {
    var b = e.target.closest('.es-row'); if (!b) return;
    var k = b.getAttribute('data-k'); S[k] = !S[k]; put('mb_ed_' + k, S[k]); paint();
    if (k === 'wrap') applyWrap();
    else if (k === 'ln') applyLn();
    else if (S.awake) {
      lock().then(function () { toast('Screen will stay on', 'success'); }).catch(function () {
        S.awake = false; put('mb_ed_awake', false); paint(); toast('Keep screen on is not supported here', 'error');
      });
    } else unlock();
  });

  var drag = null, tx = 0, ty = 0, cx = 0, cy = 0, anim = 0, wasDrag = false;
  function step() {
    cx += (tx - cx) * 0.3; cy += (ty - cy) * 0.3;
    if (!drag && Math.abs(tx - cx) < 0.5 && Math.abs(ty - cy) < 0.5) { cx = tx; cy = ty; anim = 0; }
    else anim = requestAnimationFrame(step);
    card.style.left = cx + 'px'; card.style.top = cy + 'px';
  }
  card.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var r = card.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, on: false, id: e.pointerId };
  });
  card.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var mx = e.clientX - drag.x, my = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(mx) + Math.abs(my) < 8) return;
      drag.on = true; moved = true; cx = drag.l; cy = drag.t;
      try { card.setPointerCapture(drag.id); } catch (x) {}
      card.classList.add('dragging');
    }
    tx = Math.max(4, Math.min(window.innerWidth - card.offsetWidth - 4, drag.l + mx));
    ty = Math.max(4, Math.min(window.innerHeight - card.offsetHeight - 4, drag.t + my));
    if (!anim) anim = requestAnimationFrame(step);
    e.preventDefault();
  });
  function endDrag() {
    if (drag && drag.on) { wasDrag = true; setTimeout(function () { wasDrag = false; }, 60); }
    drag = null; card.classList.remove('dragging');
  }
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
  card.addEventListener('click', function (e) { if (wasDrag) { e.stopPropagation(); e.preventDefault(); } }, true);

  var st = document.createElement('style'); st.id = 'edSettingsStyle';
  st.textContent = [
    '#editorShell.mb-wrap .editor-hl,#editorShell.mb-wrap .editor-code #editorTextarea{white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:normal!important;overflow-x:hidden!important}',
    '#editorShell.mb-wrap .editor-code #editorTextarea{scrollbar-width:none}',
    '#editorShell.mb-wrap .editor-code #editorTextarea::-webkit-scrollbar{display:none}',
    '#editorShell.mb-noln .editor-gutter{display:none}',
    '.ed-set-card{display:none;position:fixed;z-index:9999;width:250px;padding:8px;background:#17181c;border:1px solid #2c2d34;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.55)}',
    '.ed-set-card.open{display:block}',
    '.ed-set-card .es-ttl{font-size:9px;font-weight:800;letter-spacing:1.2px;color:var(--red);text-transform:uppercase;margin:4px 4px 8px}',
    '.ed-set-card{touch-action:none;user-select:none;-webkit-user-select:none;transition:transform .2s ease,box-shadow .2s ease,opacity .2s ease}',
    '.ed-set-card.dragging{opacity:.92;transform:scale(1.03);box-shadow:0 20px 40px rgba(0,0,0,.8)}',
    '.ed-set-card .es-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 8px;margin:0;border:0;border-radius:9px;background:transparent;color:#e5e6ea;font-family:inherit;text-align:left;cursor:pointer}',
    '.ed-set-card .es-row:active{background:#20222a}',
    '.ed-set-card .es-txt{flex:1;min-width:0}',
    '.ed-set-card .es-txt b{display:block;font-size:13px}',
    '.ed-set-card .es-txt small{display:block;font-size:10px;color:var(--muted);margin-top:2px;line-height:1.3}',
    '.ed-set-card .es-sw{position:relative;flex-shrink:0;width:38px;height:22px;border-radius:11px;background:#33353d;transition:background .15s}',
    '.ed-set-card .es-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}',
    '.ed-set-card .es-row.on .es-sw{background:var(--red)}',
    '.ed-set-card .es-row.on .es-sw::after{transform:translateX(16px)}'
  ].join('\n');
  document.head.appendChild(st);

  applyLn();
  applyWrap();
  if (S.awake) lock().catch(function () {});
})();

/* Multi Bundle - editor quick tools: one small button opens a small card of fast actions. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('editorTextarea'), row = document.querySelector('.et-file-row');
  if (!ta || !row || $('editorToolsBtn')) return;
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }

  /* ---------- pure text operations ---------- */
  function lineRange(v, a, b) {
    var start = a > 0 ? v.lastIndexOf('\n', a - 1) + 1 : 0;
    var probe = (b > a && v.charAt(b - 1) === '\n') ? b - 1 : b;
    var end = v.indexOf('\n', probe); if (end < 0) end = v.length;
    return { start: start, end: end };
  }
  function selectLineOp(v, a, b) { var r = lineRange(v, a, b); return { v: v, a: r.start, b: r.end }; }
  function dupOp(v, a, b) {
    var r = lineRange(v, a, b), text = v.slice(r.start, r.end);
    return { v: v.slice(0, r.end) + '\n' + text + v.slice(r.end), a: r.end + 1, b: r.end + 1 + text.length };
  }
  function delOp(v, a, b) {
    var r = lineRange(v, a, b), nv, pos;
    if (r.end < v.length) { nv = v.slice(0, r.start) + v.slice(r.end + 1); pos = r.start; }
    else if (r.start > 0) { nv = v.slice(0, r.start - 1); pos = r.start - 1; }
    else { nv = ''; pos = 0; }
    return { v: nv, a: pos, b: pos };
  }
  function indentOp(v, a, b) {
    var r = lineRange(v, a, b);
    var nb = v.slice(r.start, r.end).split('\n').map(function (l) { return l.trim() ? '  ' + l : l; }).join('\n');
    var nv = v.slice(0, r.start) + nb + v.slice(r.end);
    if (a === b) { var p = Math.min(nv.length, a + 2); return { v: nv, a: p, b: p }; }
    return { v: nv, a: r.start, b: r.start + nb.length };
  }
  function outdentOp(v, a, b) {
    var r = lineRange(v, a, b), removedFirst = 0, first = true;
    var nb = v.slice(r.start, r.end).split('\n').map(function (l) {
      var m = l.match(/^(\t| {1,2})/); var n = m ? m[0].length : 0;
      if (first) { removedFirst = n; first = false; }
      return l.slice(n);
    }).join('\n');
    var nv = v.slice(0, r.start) + nb + v.slice(r.end);
    if (a === b) { var p = Math.max(r.start, a - removedFirst); return { v: nv, a: p, b: p }; }
    return { v: nv, a: r.start, b: r.start + nb.length };
  }
  function kindFor(v, pos, ext, firstLine) {
    ext = (ext || '').toLowerCase();
    if (ext === 'css' || ext === 'scss' || ext === 'less') return 'css';
    if (ext === 'json') return 'none';
    if (['js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx'].indexOf(ext) > -1) return 'js';
    if (['html', 'htm', 'svg', 'xml', 'vue', 'md'].indexOf(ext) > -1) {
      var t = (firstLine || '').trim().toLowerCase();
      if (/^<\/?(script|style)\b/.test(t)) return 'html';
      var before = v.slice(0, pos).toLowerCase();
      var s = before.lastIndexOf('<script'), se = before.lastIndexOf('</script');
      if (s > se && s >= 0 && before.indexOf('>', s) >= 0) return 'js';
      var st = before.lastIndexOf('<style'), ste = before.lastIndexOf('</style');
      if (st > ste && st >= 0 && before.indexOf('>', st) >= 0) return 'css';
      return 'html';
    }
    return 'js';
  }
  function commentOp(v, a, b, ext) {
    var r = lineRange(v, a, b), lines = v.slice(r.start, r.end).split('\n');
    var kind = kindFor(v, r.start, ext, lines[0]);
    if (kind === 'none') return null;
    var open = kind === 'js' ? '// ' : kind === 'css' ? '/* ' : '<!-- ';
    var close = kind === 'js' ? '' : kind === 'css' ? ' */' : ' -->';
    function isOn(l) {
      var t = l.trim();
      return kind === 'js' ? t.indexOf('//') === 0 : kind === 'css' ? (t.indexOf('/*') === 0 && t.slice(-2) === '*/') : (t.indexOf('<!--') === 0 && t.slice(-3) === '-->');
    }
    var filled = lines.filter(function (l) { return l.trim(); });
    var allOn = filled.length > 0 && filled.every(isOn);
    var out = lines.map(function (l) {
      if (!l.trim()) return l;
      var ind = l.match(/^\s*/)[0], rest = l.slice(ind.length);
      if (allOn) {
        if (kind === 'js') rest = rest.replace(/^\/\/ ?/, '');
        else if (kind === 'css') rest = rest.replace(/^\/\* ?/, '').replace(/ ?\*\/\s*$/, '');
        else rest = rest.replace(/^<!-- ?/, '').replace(/ ?-->\s*$/, '');
        return ind + rest;
      }
      return ind + open + rest.replace(/\s+$/, '') + close;
    });
    var nb = out.join('\n');
    return { v: v.slice(0, r.start) + nb + v.slice(r.end), a: r.start, b: r.start + nb.length };
  }

  /* ---------- glue to the editor ---------- */
  function ext() { var s = $('editorFileSelect'); var p = (s && s.value) || ''; var i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i + 1); }
  function haveFile() { var s = $('editorFileSelect'); return !!(s && s.value) || ta.value.length > 0; }
  function applyOp(res) {
    if (!res) return false;
    ta.value = res.v;
    ta.blur(); // Force keyboard down
    ta.setSelectionRange(res.a, res.b);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  function lineHeightPx() { var cs = window.getComputedStyle ? getComputedStyle(ta) : null; return (cs && parseFloat(cs.lineHeight)) || 20; }
  function scrollToCaret() {
    var pos = ta.selectionStart, before = ta.value.slice(0, pos), line = before.split('\n').length - 1;
    var lh = lineHeightPx(), top = (((typeof window.__mbWrapRow === 'function' && window.__mbWrapRow(pos)) || (line + 1)) - 1) * lh, view = ta.clientHeight || 300;
    if (top < ta.scrollTop || top > ta.scrollTop + view - lh * 2) ta.scrollTop = Math.max(0, top - view / 3);
  }
  function copyText(t, okMsg) {
    function fb() { var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(a); toast(okMsg, 'success'); }
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(function () { toast(okMsg, 'success'); }, fb); return; }
    } catch (e) {}
    fb();
  }
  async function pasteText() {
    try {
      var t = await navigator.clipboard.readText();
      if (!t) { toast('Clipboard is empty'); return; }
      var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
      applyOp({ v: v.slice(0, a) + t + v.slice(b), a: a + t.length, b: a + t.length });
      scrollToCaret();
    } catch (e) { toast('Allow clipboard access, or long-press the code and tap Paste', 'error'); }
  }
  async function goToLine() {
    var n = ta.value.split('\n').length;
    var ans = typeof window.showPrompt === 'function' ? await window.showPrompt('Go to line', '', { message: 'Type a line number from 1 to ' + n + '.', placeholder: 'e.g. 120', confirmText: 'Go' }) : null;
    if (ans == null) return;
    var num = parseInt(String(ans).replace(/\D/g, ''), 10);
    if (!num) return;
    num = Math.max(1, Math.min(num, n));
    var lines = ta.value.split('\n'), pos = 0;
    for (var i = 0; i < num - 1; i++) pos += lines[i].length + 1;
    ta.blur();
    ta.setSelectionRange(pos, pos + lines[num - 1].length);
    ta.scrollTop = Math.max(0, ((typeof window.__mbWrapRow === 'function' && window.__mbWrapRow(pos) || num) - 3) * lineHeightPx()); ta.scrollLeft = 0;
  }

  var fs = 13;
  try { fs = parseInt(localStorage.getItem('mb_edfs'), 10) || 13; } catch (e) {}
  function setFs(n) {
    fs = Math.max(10, Math.min(22, n));
    var sh = $('editorShell'); if (sh && sh.style) sh.style.setProperty('--ed-fs', fs + 'px');
    var l = $('etFs'); if (l) l.textContent = fs;
    try { localStorage.setItem('mb_edfs', String(fs)); } catch (e) {}
  }

  function countDoubles() {
    var lines = ta.value.split('\n'), prev = null, n = 0;
    lines.forEach(function (l) {
      var t = l.trim();
      if (t && t === prev && /[A-Za-z0-9]/.test(t)) n++; else prev = t;
    });
    return n;
  }
  function updateDedup() {
    var b = $('etDedup'); if (!b) return;
    b.textContent = 'Remove DBT (' + countDoubles() + ')';
  }
  ta.addEventListener('input', function () {
    clearTimeout(window.__dbtT); window.__dbtT = setTimeout(updateDedup, 300);
  });
  var ACTIONS = {
    all: function () { if (!haveFile()) return toast('Open a file first'); ta.blur(); ta.select(); },
    copy: function () { if (!ta.value) return toast('Nothing to copy'); var n = ta.value.split('\n').length; copyText(ta.value, 'Copied all ' + n + ' lines'); },
    top: function () { ta.blur(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; ta.scrollLeft = 0; },
    last: function () { ta.blur(); var n = ta.value.length; ta.setSelectionRange(n, n); ta.scrollTop = ta.scrollHeight; ta.scrollLeft = 0; },
    line: goToLine,
    sel: function () { applyOp(selectLineOp(ta.value, ta.selectionStart, ta.selectionEnd)); },
    dup: function () { applyOp(dupOp(ta.value, ta.selectionStart, ta.selectionEnd)); scrollToCaret(); },
    del: function () { applyOp(delOp(ta.value, ta.selectionStart, ta.selectionEnd)); scrollToCaret(); },
    cmt: function () { if (!applyOp(commentOp(ta.value, ta.selectionStart, ta.selectionEnd, ext()))) toast('This file type has no comments'); },
    paste: pasteText,
    cut: function () {
      var a = ta.selectionStart, b = ta.selectionEnd;
      if (a === b) return toast('Select something first (try Select all)');
      var t = ta.value.slice(a, b); copyText(t, 'Cut ' + t.length + ' characters');
      applyOp({ v: ta.value.slice(0, a) + ta.value.slice(b), a: a, b: a });
    },
    delsel: function () {
      var a = ta.selectionStart, b = ta.selectionEnd;
      if (a === b) return toast('Select something first (try Select all)');
      applyOp({ v: ta.value.slice(0, a) + ta.value.slice(b), a: a, b: a }); toast('Deleted. Tap Undo to bring it back.');
    },
    bksp: function () {
      var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      if (a === b) { if (a === 0) return; a = a - 1; }
      applyOp({ v: v.slice(0, a) + v.slice(b), a: a, b: a });
    },
    clear: async function () {
      if (!ta.value) return toast('The file is already empty');
      var ok = typeof window.showConfirm === 'function' ? await window.showConfirm('Delete all the code in this file? You can bring it back with Undo.', { title: 'Clear all code?', confirmText: 'Clear all', cancelText: 'Cancel' }) : true;
      if (!ok) return;
      applyOp({ v: '', a: 0, b: 0 }); toast('Cleared. Tap Undo to bring it back.');
    },
    renthis: function () { closeCard(); if (typeof window.__renameCurrentFile === 'function') window.__renameCurrentFile(); else toast('Not ready'); },
    renfiles: function () { closeCard(); if (typeof window.__openRenameFiles === 'function') window.__openRenameFiles(); else toast('Not ready'); },
    delthis: function () { closeCard(); if (typeof window.__deleteCurrentFile === 'function') window.__deleteCurrentFile(); else toast('Not ready'); },
delfiles: function () { closeCard(); if (typeof window.__openDeleteFiles === 'function') window.__openDeleteFiles(); else toast('Not ready'); },
    ind: function () { applyOp(indentOp(ta.value, ta.selectionStart, ta.selectionEnd)); },
    out: function () { applyOp(outdentOp(ta.value, ta.selectionStart, ta.selectionEnd)); },
    dedup: async function () {
      if (!haveFile()) return toast('Open a file first');
      var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd, s = 0, e = v.length;
      if (a !== b) { var r = lineRange(v, a, b); s = r.start; e = r.end; }
      var lines = v.slice(s, e).split('\n'), out = [], prev = null, n = 0;
      lines.forEach(function (l) {
        var t = l.trim();
        if (t && t === prev && /[A-Za-z0-9]/.test(t)) { n++; return; }
        out.push(l); prev = t;
      });
      if (!n) return toast('No doubled lines found');
      var ok = typeof window.showConfirm === 'function' ? await window.showConfirm('Found ' + n + ' line' + (n === 1 ? '' : 's') + ' that repeat the line right above them. Remove ' + (n === 1 ? 'it' : 'them') + '? You can bring ' + (n === 1 ? 'it' : 'them') + ' back with Undo.', { title: 'Remove doubled lines?', confirmText: 'Remove', cancelText: 'Cancel' }) : true;
      if (!ok) return;
      applyOp({ v: v.slice(0, s) + out.join('\n') + v.slice(e), a: s, b: s });
      toast('Removed ' + n + ' doubled line' + (n === 1 ? '' : 's') + '. Tap Undo to bring back.', 'success');
    },
    fsm: function () { setFs(fs - 1); },
    fsp: function () { setFs(fs + 1); }
  };
  var KEEP_OPEN = { fsm: 1, fsp: 1, bksp: 1 };

  /* ---------- the button and the card ---------- */
  var SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  var btn = document.createElement('button');
  btn.id = 'editorToolsBtn'; btn.className = 'editor-btn small'; btn.title = 'Quick tools'; btn.setAttribute('aria-label', 'Quick tools'); btn.innerHTML = SVG;
  var theme = $('editorThemeBtn');
  if (theme) row.insertBefore(btn, theme); else row.appendChild(btn);

  var card = document.createElement('div');
  card.id = 'editorToolsCard'; card.className = 'ed-tools-card';
  card.innerHTML =
    '<div class="et-ttl">Select &amp; clear</div><div class="et-grid">' +
    '<button data-a="all">Select all</button><button data-a="copy">Copy all</button>' +
    '<button data-a="cut">Cut selected</button><button data-a="delsel">Delete selected</button>' +
    '<button data-a="clear">Clear all code</button><button data-a="bksp">\u232b Backspace</button></div>' +
    '<div class="et-ttl" style="margin-top:10px">Move &amp; edit</div><div class="et-grid">' +
    '<button data-a="top">Go to top</button><button data-a="last">Go to last</button>' +
    '<button data-a="line">Go to line</button><button data-a="sel">Select line</button>' +
    '<button data-a="dup">Duplicate line</button><button data-a="del">Delete line</button>' +
    '<button data-a="cmt">Comment line</button><button data-a="paste">Paste</button>' +
    '<button data-a="renthis">Rename this file</button><button data-a="renfiles">Rename file</button>' +
    '<button data-a="delthis">Delete this file</button><button data-a="delfiles">Delete file</button>' +
    '<button data-a="dedup" id="etDedup" style="grid-column:1 / -1;padding:10px 4px;font-size:12px">Remove DBT (0)</button></div>' +
    '<div class="et-size"><span>Text size</span><button data-a="fsm" aria-label="Smaller">A\u2212</button><b id="etFs">' + fs + '</b><button data-a="fsp" aria-label="Bigger">A+</button></div>';
  
  // APPEND TO BODY (Floats over everything)
  document.body.appendChild(card); 

  function closeCard() { card.classList.remove('open'); }
  
  let isDragging = false;
let initialX = 0, initialY = 0;
let hasMoved = false;
let savedLeft = 0, savedTop = 0;

  function openCard() {
  updateDedup();
  var tc = $('editorThemeCard'); if (tc) tc.classList.remove('open');
  card.classList.add('open');
  
  if (hasMoved) {
    // Use the saved position if dragged
    card.style.left = savedLeft + 'px';
    card.style.top = savedTop + 'px';
  } else {
    // Default position under the button
    var rect = btn.getBoundingClientRect();
    var cardWidth = 200;
    var leftPos = Math.min(rect.left, window.innerWidth - cardWidth - 10);
    card.style.left = leftPos + 'px';
    card.style.top = (rect.bottom + 6) + 'px';
  }
  card.style.right = 'auto';
}

  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.onclick = function (e) { e.stopPropagation(); if (card.classList.contains('open')) closeCard(); else openCard(); };
  
  card.addEventListener('click', function (e) {
    if (isDragging) return; // Ignore clicks if dragging
    e.preventDefault(); 
    e.stopPropagation();
    var b = e.target.closest && e.target.closest('button[data-a]'); if (!b) return;
    var a = b.dataset.a; 
    // Removed closeCard() here so the menu stays open!
    ACTIONS[a] && ACTIONS[a]();
  });

  // --- SMOOTH DRAG LOGIC ---
  card.addEventListener('touchstart', function(e) {
    if (e.target.closest('button')) return; 
    isDragging = false;
    const rect = card.getBoundingClientRect();
    initialX = e.touches[0].clientX - rect.left;
    initialY = e.touches[0].clientY - rect.top;
    card.style.transition = 'none'; 
  }, {passive: true});

  card.addEventListener('touchmove', function(e) {
    if (e.target.closest('button')) return;
    if (e.touches.length > 1) return;
    
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    
    if (!isDragging) {
      if (Math.abs(x - (initialX + card.offsetLeft)) > 5 || Math.abs(y - (initialY + card.offsetTop)) > 5) {
        isDragging = true;
        card.classList.add('ed-dragging');
      }
    }
    
    if (isDragging) {
      if (e.cancelable) e.preventDefault(); 
      card.style.left = (x - initialX) + 'px';
      card.style.top = (y - initialY) + 'px';
    }
  }, {passive: false});

  card.addEventListener('touchend', function() {
  if (isDragging) {
    card.classList.remove('ed-dragging');
    hasMoved = true;
    savedLeft = parseInt(card.style.left, 10);
    savedTop = parseInt(card.style.top, 10);
    setTimeout(() => { isDragging = false; }, 50); 
  }
});

// Reset position when you change files or close the editor tab
var fileSelect = $('editorFileSelect');
if (fileSelect) {
  fileSelect.addEventListener('change', function() { hasMoved = false; });
}
var editorPage = $('editorPage');
if (editorPage) {
  const obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'hidden' && editorPage.hidden) {
        hasMoved = false;
        closeCard();
      }
    });
  });
  obs.observe(editorPage, { attributes: true });
}

  card.addEventListener('mousedown', function (e) { e.preventDefault(); });
  document.addEventListener('click', closeCard);
  
  if (theme) theme.addEventListener('click', closeCard, true);
  var pub = $('editorPublishBtn'); if (pub) pub.addEventListener('click', closeCard, true);

  var st = document.createElement('style'); st.id = 'edToolsStyle';
  st.textContent = [
    '.et-file-row #editorToolsBtn{height:42px;min-width:42px;flex-shrink:0;border-radius:10px;background:#2a2d1f;color:#f5d76e;border-color:#4b4a2a}',
    '.ed-tools-card{display:none;position:fixed;z-index:9999;width:200px;max-height:65vh;overflow-y:auto;padding:6px;background:#17181c;border:1px solid #2c2d34;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.55);touch-action:none;right:auto!important;bottom:auto!important;}',
    '.ed-tools-card.open{display:block}',
    '.ed-tools-card .et-ttl{font-size:9px;font-weight:800;letter-spacing:1.2px;color:var(--red);text-transform:uppercase;margin:4px 4px 6px}',
    '.ed-tools-card .et-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}',
    '.ed-tools-card button{background:#20222a;color:#e5e6ea;border:1px solid #303139;border-radius:8px;padding:6px 4px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease,background .14s ease}',
    '.ed-tools-card button:active{transform:scale(.95);background:#2d303a}',
    '.ed-tools-card .et-size{display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #25262c}',
    '.ed-tools-card .et-size span{flex:1;font-size:10px;font-weight:700;color:var(--muted)}',
    '.ed-tools-card .et-size button{padding:4px 8px;font-size:10px}',
    '.ed-tools-card .et-size b{min-width:16px;text-align:center;font-size:11px}',
    '#editorShell{--ed-fs:13px}',
    '#editorTextarea,#editorHighlight,#editorGutter{font-size:var(--ed-fs,13px)!important;line-height:calc(var(--ed-fs,13px) * 1.55)!important}',
    '.ed-dragging{opacity:0.9;transform:scale(1.02)!important;box-shadow:0 20px 40px rgba(0,0,0,.8)!important}'
  ].join('\n');
  document.head.appendChild(st);
  setFs(fs);

  window.__edt = { ops: { lineRange: lineRange, selectLineOp: selectLineOp, dupOp: dupOp, delOp: delOp, indentOp: indentOp, outdentOp: outdentOp, commentOp: commentOp, kindFor: kindFor }, actions: ACTIONS };
})();