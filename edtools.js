/* Multi Bundle - editor quick tools: one small button opens a small card of fast actions. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('editorTextarea'), row = document.querySelector('.et-file-row');
  if (!ta || !row || $('editorToolsBtn')) return;
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }

  /* ---------- pure text operations: (text, selStart, selEnd) -> {v, a, b} ---------- */
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
  // Which comment style fits this spot? (HTML files can hold <script> and <style> blocks)
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
ta.setSelectionRange(res.a, res.b);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  function lineHeightPx() { var cs = window.getComputedStyle ? getComputedStyle(ta) : null; return (cs && parseFloat(cs.lineHeight)) || 20; }
  function scrollToCaret() {
    var pos = ta.selectionStart, before = ta.value.slice(0, pos), line = before.split('\n').length - 1;
    var lh = lineHeightPx(), top = line * lh, view = ta.clientHeight || 300;
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
    ta.setSelectionRange(pos, pos + lines[num - 1].length);
    ta.scrollTop = Math.max(0, (num - 3) * lineHeightPx()); ta.scrollLeft = 0;
  }

  // text size
  var fs = 13;
  try { fs = parseInt(localStorage.getItem('mb_edfs'), 10) || 13; } catch (e) {}
  function setFs(n) {
    fs = Math.max(10, Math.min(22, n));
    var sh = $('editorShell'); if (sh && sh.style) sh.style.setProperty('--ed-fs', fs + 'px');
    var l = $('etFs'); if (l) l.textContent = fs;
    try { localStorage.setItem('mb_edfs', String(fs)); } catch (e) {}
  }

  var ACTIONS = {
    all: function () { if (!haveFile()) return toast('Open a file first'); ta.select(); },
copy: function () { if (!ta.value) return toast('Nothing to copy'); var n = ta.value.split('\n').length; copyText(ta.value, 'Copied all ' + n + ' lines'); },
top: function () { ta.setSelectionRange(0, 0); ta.scrollTop = 0; ta.scrollLeft = 0; },
last: function () { var n = ta.value.length; ta.setSelectionRange(n, n); ta.scrollTop = ta.scrollHeight; ta.scrollLeft = 0; },
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
    undo: function () { var u = $('editorUndoBtn'); if (u && !u.disabled) u.click(); else toast('Nothing to undo'); },
    ind: function () { applyOp(indentOp(ta.value, ta.selectionStart, ta.selectionEnd)); },
    out: function () { applyOp(outdentOp(ta.value, ta.selectionStart, ta.selectionEnd)); },
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
    '<button data-a="ind">Indent</button><button data-a="out">Outdent</button>' +
    '<button data-a="undo">Undo</button></div>' +
    '<div class="et-size"><span>Text size</span><button data-a="fsm" aria-label="Smaller">A\u2212</button><b id="etFs">' + fs + '</b><button data-a="fsp" aria-label="Bigger">A+</button></div>';
  row.appendChild(card);

  function closeCard() { card.classList.remove('open'); }
  function openCard() {
    var tc = $('editorThemeCard'); if (tc) tc.classList.remove('open');
    card.classList.add('open');
    var w = card.offsetWidth || 232, max = (row.clientWidth || 360) - w;
    card.style.left = Math.max(0, Math.min(btn.offsetLeft, max)) + 'px';
  }
  btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  btn.onclick = function (e) { e.stopPropagation(); if (card.classList.contains('open')) closeCard(); else openCard(); };
  card.addEventListener('click', function (e) {
    e.stopPropagation();
    var b = e.target.closest && e.target.closest('button[data-a]'); if (!b) return;
    var a = b.dataset.a; if (!KEEP_OPEN[a]) closeCard();
    ACTIONS[a] && ACTIONS[a]();
  });
  card.addEventListener('mousedown', function (e) { e.preventDefault(); });
  document.addEventListener('click', closeCard);
  // opening the colors button or the publish sheet closes this card
  if (theme) theme.addEventListener('click', closeCard, true);
  var pub = $('editorPublishBtn'); if (pub) pub.addEventListener('click', closeCard, true);

  var st = document.createElement('style'); st.id = 'edToolsStyle';
  st.textContent = [
    '.et-file-row #editorToolsBtn{height:42px;min-width:42px;flex-shrink:0;border-radius:10px;background:#2a2d1f;color:#f5d76e;border-color:#4b4a2a}',
    '.ed-tools-card{display:none;position:absolute;top:calc(100% + 6px);z-index:41;width:232px;max-height:72vh;overflow-y:auto;padding:8px;background:#17181c;border:1px solid #2c2d34;border-radius:12px;box-shadow:0 14px 34px rgba(0,0,0,.55)}',
    '.ed-tools-card.open{display:block}',
    '.ed-tools-card .et-ttl{font-size:10px;font-weight:800;letter-spacing:1.4px;color:var(--red);text-transform:uppercase;margin:2px 4px 8px}',
    '.ed-tools-card .et-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.ed-tools-card button{background:#20222a;color:#e5e6ea;border:1px solid #303139;border-radius:9px;padding:9px 6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .14s ease,background .14s ease}',
    '.ed-tools-card button:active{transform:scale(.95);background:#2d303a}',
    '.ed-tools-card .et-size{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #25262c}',
    '.ed-tools-card .et-size span{flex:1;font-size:11px;font-weight:700;color:var(--muted)}',
    '.ed-tools-card .et-size button{padding:7px 12px}',
    '.ed-tools-card .et-size b{min-width:20px;text-align:center;font-size:12px}',
    '#editorShell{--ed-fs:13px}',
    '#editorTextarea,#editorHighlight,#editorGutter{font-size:var(--ed-fs,13px)!important;line-height:calc(var(--ed-fs,13px) * 1.55)!important}'
  ].join('\n');
  document.head.appendChild(st);
  setFs(fs);

  window.__edt = { ops: { lineRange: lineRange, selectLineOp: selectLineOp, dupOp: dupOp, delOp: delOp, indentOp: indentOp, outdentOp: outdentOp, commentOp: commentOp, kindFor: kindFor }, actions: ACTIONS };
})();
