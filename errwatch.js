/* Multi Bundle - Preview error watcher.
   When a previewed page breaks or stays blank, show every problem with its file, line and likely cause. */
(function () {
  'use strict';
  if (window.__mbErrWatch) return;
  window.__mbErrWatch = 1;

  /* Code that runs inside the preview page and reports problems back to Multi Bundle */
  var CATCHER = '(function(){var ID=__ID__,n=0;' +
    'function send(o){if(n>=8)return;n++;o.type="mb-err";o.id=ID;try{parent.postMessage(o,"*")}catch(x){}}' +
    'window.addEventListener("error",function(e){' +
      'var t=e.target;' +
      'if(t&&t!==window&&(t.src||t.href)){send({kind:"load",tag:t.tagName,url:String(t.src||t.href)});return}' +
      'send({kind:"js",msg:e.message||"Script error",line:e.lineno||0,col:e.colno||0})' +
    '},true);' +
    'window.addEventListener("unhandledrejection",function(e){var r=e.reason;send({kind:"promise",msg:(r&&r.message)||String(r),line:0,col:0})});' +
    'window.addEventListener("load",function(){setTimeout(function(){' +
      'var b=document.body;if(!b)return;' +
      'if(!(b.innerText||"").replace(/\\s+/g,"")&&!b.querySelector("img,canvas,svg,video,iframe,input,button,textarea,select"))send({kind:"blank"})' +
    '},1200)});' +
  '})();';

  var seq = 0, docs = {}, panel = null, curId = 0, list = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s).replace(/\r\n?/g, '\n'); }
  function pad(n) { n = String(n); while (n.length < 4) n = ' ' + n; return n; }
  function base(p) { return String(p).split('/').pop(); }
  function plainText(h) { return String(h).replace(/<[^>]+>/g, ''); }

  function close() { if (panel) { panel.remove(); panel = null; } list = []; curId = 0; }

  /* Turn a line number of the preview page into the real file and line */
  function locate(id, line) {
    var doc = docs[id]; if (!doc || !line) return null;
    var lines = doc.split('\n'); if (line > lines.length) return null;
    var start = 0, i;
    for (i = 0; i < line - 1; i++) start += lines[i].length + 1;
    var pos = start + lines[line - 1].length;
    var tag = doc.lastIndexOf('<script', pos); if (tag < 0) return null;
    var open = doc.indexOf('>', tag) + 1;
    var end = doc.indexOf('</script>', open); if (end < 0 || start > end) return null;
    var rel = (doc.slice(open, Math.max(start, open)).match(/\n/g) || []).length + 1;
    var block = doc.slice(open, end).replace(/<\\\/(script)/gi, '</$1');
    if (!block.trim()) return null;
    var fl = (typeof files !== 'undefined' && files) ? files : [];
    var f = null, off = 0, tx, at;
    for (i = 0; i < fl.length && !f; i++) {
      tx = fl[i].text; if (tx == null) continue;
      if (norm(tx) === block) { f = fl[i]; off = 0; }
    }
    for (i = 0; i < fl.length && !f; i++) {
      tx = fl[i].text; if (tx == null) continue;
      tx = norm(tx); at = tx.indexOf(block);
      if (at > -1) { f = fl[i]; off = (tx.slice(0, at).match(/\n/g) || []).length; }
    }
    if (!f) return null;
    return { path: f.path, line: off + rel, lines: norm(f.text).split('\n') };
  }
  window.__mbErrLocate = locate;

  function hint(msg, kind) {
    var m = String(msg || ''), x;
    if (kind === 'blank') return 'Nothing was drawn on the page. Check that the page has content, and that the script that builds it loaded without errors.';
    if (/^Script error\.?$/i.test(m)) return 'A script from another website failed, so the browser hides the details. Check the internet connection and the script link.';
    if ((x = m.match(/([\w$.]+) is not defined/))) return '"' + x[1] + '" is used but was never created. Check the spelling, or make sure the file that creates it loads first.';
    if (/Cannot read propert(y|ies) of (null|undefined)/.test(m) || /null is not an object|undefined is not an object/.test(m)) {
      x = m.match(/reading '([^']+)'/);
      return 'The code used something that does not exist yet' + (x ? ' (it tried to read "' + x[1] + '")' : '') + '. Often an element id that is missing from the page, or a script that runs before the page is ready.';
    }
    if (/is not a function/.test(m)) return 'The code tried to run something that is not a function. Check the name and where it comes from.';
    if (/Unexpected token '<'/.test(m)) return 'A script file contains HTML instead of code. The script path is probably wrong.';
    if (/Unexpected token|Unexpected end|Unexpected identifier|missing \)|Invalid or unexpected|Unexpected string/.test(m)) return 'A typing mistake in the code, like a missing bracket, quote or comma. Look at this line and the one just above it.';
    if (/Assignment to constant/.test(m)) return 'A "const" value was changed. Use "let" instead of "const" for values that change.';
    if (/has already been declared/.test(m)) return 'The same name is created twice. Rename one of them or remove the duplicate.';
    if (/Failed to fetch|NetworkError|Load failed/.test(m)) return 'A network request failed. A preview cannot reach some servers, or the address is wrong.';
    return '';
  }

  /* Build one problem entry from a report sent by the preview page */
  function entryOf(d) {
    var kind = d.kind;
    var e = { kind: kind, title: '', msg: String(d.msg || '').replace(/^Uncaught\s+/, ''), where: '', code: '', raw: '', plain: '', path: '', line: 0, col: d.col || 0, key: '' };
    if (kind === 'load') {
      var u = String(d.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/^about:srcdoc\/?/, '');
      e.title = 'FILE NOT LOADED';
      e.msg = 'Could not load ' + (u || 'a file');
      e.where = 'A <b>' + esc(String(d.tag || '').toLowerCase()) + '</b> tag points to a file that is missing or cannot be opened.';
      e.plain = 'Check that the file is in the project and the path and spelling match. Capital letters matter.';
    } else if (kind === 'blank') {
      e.title = 'PAGE LOOKS BLANK';
      e.msg = 'The page loaded but shows nothing';
      e.plain = hint('', 'blank');
    } else {
      e.title = kind === 'promise' ? 'A TASK FAILED' : 'ERROR IN YOUR CODE';
      var loc = locate(d.id, d.line);
      if (loc) {
        e.path = loc.path; e.line = loc.line;
        e.where = 'In <b>' + esc(loc.path) + '</b> \u00b7 line <b>' + loc.line + '</b>';
        var a = Math.max(1, loc.line - 1), b = Math.min(loc.lines.length, loc.line + 1);
        for (var n = a; n <= b; n++) {
          var tx = loc.lines[n - 1] || ''; if (tx.length > 160) tx = tx.slice(0, 160) + '\u2026';
          e.raw += pad(n) + '  ' + tx + '\n';
        e.code += '<span' + (n === loc.line ? ' class="bad"' : '') + '>' + pad(n) + '  ' + esc(tx) + '</span>';
        }
      } else if (d.line) {
        e.line = d.line;
        e.where = 'Line <b>' + d.line + '</b> of the preview page';
        var dl = (docs[d.id] || '').split('\n')[d.line - 1];
        if (dl) { dl = dl.trim(); if (dl.length > 160) dl = dl.slice(0, 160) + '\u2026'; e.code = '<span class="bad">' + esc(dl) + '</span>'; }
      }
      e.plain = hint(e.msg, kind);
    }
    e.key = [kind, e.msg, e.path, e.line].join('|');
    return e;
  }
  window.__mbErrEntry = entryOf;

  /* ---------- Fix Error: repairs missing brackets, extra brackets, leftover old code and duplicate functions ---------- */
  function syntaxErr(code) { try { new Function(code); return null; } catch (e) { return e; } }

  /* Walk the code, skipping strings, comments, regex and template text. Returns open brackets left over and the first extra closer. */
  function scan(s, stopEmpty) {
    var st = [], i = 0, n = s.length, c, prev = '', closedAt = -1, pairs = { ')': '(', ']': '[', '}': '{' }, extra = -1, extraStack = null, tpl = [];
    function skipStr(q) { i++; while (i < n && s[i] !== q) { if (s[i] === '\\') i++; if (s[i] === '\n' && q !== '`') break; i++; } }
    while (i < n) {
      c = s[i];
      if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
      if (c === '/' && s[i + 1] === '*') { var e = s.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '"' || c === "'") { skipStr(c); i++; prev = 'a'; continue; }
      if (c === '`') {
        i++;
        while (i < n && s[i] !== '`') {
          if (s[i] === '\\') { i += 2; continue; }
          if (s[i] === '$' && s[i + 1] === '{') { st.push({ ch: '{', at: i + 1, tpl: 1 }); i += 2; break; }
          i++;
        }
        if (s[i] === '`') { i++; prev = 'a'; }
        continue;
      }
      if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(prev) > -1)) {
        i++; var cls = false;
        while (i < n && s[i] !== '\n') { if (s[i] === '\\') { i += 2; continue; } if (s[i] === '[') cls = true; else if (s[i] === ']') cls = false; else if (s[i] === '/' && !cls) break; i++; }
        i++; prev = 'a'; continue;
      }
      if (c === '(' || c === '[' || c === '{') { st.push({ ch: c, at: i }); prev = c; i++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        if (!st.length || st[st.length - 1].ch !== pairs[c]) { if (extra < 0) { extra = i; extraStack = st.slice(); } i++; prev = c; continue; }
        var top = st.pop(); i++;
        if (stopEmpty && !st.length) { closedAt = i - 1; break; }
        if (top.tpl) {
          /* back inside a template string after ${ ... } */
          while (i < n && s[i] !== '`') {
            if (s[i] === '\\') { i += 2; continue; }
            if (s[i] === '$' && s[i + 1] === '{') { st.push({ ch: '{', at: i + 1, tpl: 1 }); i += 2; break; }
            i++;
          }
          if (s[i] === '`') i++;
          prev = 'a';
        } else prev = c;
        continue;
      }
      if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? 'a' : c;
      i++;
    }
    return { open: st, extra: extra, extraStack: extraStack, closedAt: closedAt };
  }

  function matchClose(s, openIdx) {
    var r = scan(s.slice(openIdx), true);
    return r.closedAt < 0 ? -1 : openIdx + r.closedAt;
  }

  function lineStart(s, line) { var p = 0; for (var k = 1; k < line; k++) { p = s.indexOf('\n', p); if (p < 0) return -1; p++; } return p; }

  /* Candidate 1: "}(name, el) {" or "}() {" - the old function body left behind after only the header was replaced */
  function fixLeftover(s, line) {
    var ls = lineStart(s, line); if (ls < 0) return null;
    var le = s.indexOf('\n', ls); if (le < 0) le = s.length;
    var ln = s.slice(ls, le);
    var m = ln.match(/^(\s*\})\s*(?:[\w$]+\s*)?\([^()]*\)\s*\{\s*$/);
    if (!m || /^\s*\}\s*catch\b/.test(ln)) return null;
    var ob = ls + ln.lastIndexOf('{'), cb = matchClose(s, ob);
    if (cb < 0) return null;
    var after = s.slice(cb + 1).replace(/^[ \t]*\n?/, '\n');
    return { text: s.slice(0, ls) + m[1] + after, note: 'removed leftover old code after line ' + line };
  }

  /* Candidate 2: stray closing bracket */
  function fixExtra(s) {
    var r = scan(s); if (r.extra < 0) return null;
    var a = r.extra, ls = s.lastIndexOf('\n', a) + 1, le = s.indexOf('\n', a); if (le < 0) le = s.length;
    var ln = s.slice(ls, le);
    var line = s.slice(0, a).split('\n').length;
    if (/^\s*[)\]}][;,]?\s*$/.test(ln)) return { text: s.slice(0, ls) + s.slice(le + 1), note: 'removed an extra bracket on line ' + line };
    return { text: s.slice(0, a) + s.slice(a + 1), note: 'removed an extra bracket on line ' + line };
  }

  /* Candidate 2b: a closing bracket was forgotten in the middle - add it just before the closer that does not match */
  function fixInsert(s) {
    var r = scan(s); if (r.extra < 0 || !r.extraStack || !r.extraStack.length) return null;
    var want = { ')': '(', ']': '[', '}': '{' }[s[r.extra]], map = { '(': ')', '[': ']', '{': '}' };
    var st = r.extraStack, k = st.length - 1, add = '';
    while (k >= 0 && st[k].ch !== want) { if (st[k].tpl) return null; add += map[st[k].ch]; k--; }
    if (k < 0 || !add) return null;
    var ls = s.lastIndexOf('\n', r.extra - 1) + 1;
    var ind = s.slice(ls).match(/^[ \t]*/)[0];
    var line = s.slice(0, r.extra).split('\n').length;
    return { text: s.slice(0, ls) + ind + add + '\n' + s.slice(ls), note: 'added ' + add.length + ' missing bracket' + (add.length === 1 ? '' : 's') + ' (' + add + ') before line ' + line };
  }
  /* Candidate 0: a stray "." (or similar) left after a closing bracket on the error line, like "}." */
  function fixStray(s, line) {
    if (!line) return null;
    var ls = lineStart(s, line); if (ls < 0) return null;
    var le = s.indexOf('\n', ls); if (le < 0) le = s.length;
    var m = s.slice(ls, le).match(/^(\s*[)\]}][)\]};,]*)\.\s*$/);
    if (!m) return null;
    return { text: s.slice(0, ls) + m[1] + s.slice(le), note: 'removed a stray "." on line ' + line };
  }
  function score(s) { var r = scan(s); return r.open.length + (r.extra >= 0 ? 1 : 0); }

  /* Candidate 3: missing closing brackets at the end */
  function fixMissing(s) {
    var r = scan(s); if (!r.open.length || r.extra >= 0) return null;
    var map = { '(': ')', '[': ']', '{': '}' }, add = '', k;
    for (k = r.open.length - 1; k >= 0; k--) add += (r.open[k].tpl ? '}' : map[r.open[k].ch]);
    var tail = s.replace(/\s+$/, '');
    var nl = '';
    for (k = r.open.length - 1; k >= 0; k--) nl += map[r.open[k].ch] === '}' ? '}\n' : map[r.open[k].ch];
    return { text: tail + '\n' + nl.replace(/\n$/, '') + '\n', note: 'added ' + r.open.length + ' missing closing bracket' + (r.open.length === 1 ? '' : 's') + ' at the end (if the file was cut off, the missing code is NOT restored)' };
  }

  /* Candidate 4: the same function written twice. The last one wins in JavaScript, so the earlier copy is removed. */
  function fixDuplicateFn(s) {
    var re = /^([ \t]*)(?:async\s+)?function\s*\*?\s*([\w$]+)\s*\(/gm, seen = {}, m, list = [];
    while ((m = re.exec(s))) { (seen[m[2]] = seen[m[2]] || []).push(m.index); }
    var name = Object.keys(seen).filter(function (k) { return seen[k].length > 1; })[0];
    if (!name) return null;
    var at = seen[name][0], ob = s.indexOf('{', s.indexOf(')', at)); if (ob < 0) return null;
    var cb = matchClose(s, ob); if (cb < 0) return null;
    var end = s.indexOf('\n', cb); end = end < 0 ? s.length : end + 1;
    return { text: s.slice(0, at) + s.slice(end), note: 'removed the first copy of duplicate function ' + name };
  }

  /* Returns { ok, text, notes } or { ok:false, why } */
  function fixJs(src, errLine) {
    var s = String(src).replace(/\r\n?/g, '\n');
    if (/^\s*(import|export)\s/m.test(s)) return { ok: false, why: 'This file uses import/export, so it cannot be checked safely.' };
    if (!syntaxErr(s)) return { ok: false, why: 'No typing mistake found. This error happens while the code runs, so it needs a manual fix.' };
    var notes = [], round, c, cl, k, best, bs, sc, cur = score(s);
    for (round = 0; round < 12; round++) {
      c = round === 0 && errLine ? fixLeftover(s, errLine) : null;
      if (!c) {
        cl = [fixStray(s, errLine), fixInsert(s), fixExtra(s), fixMissing(s), fixDuplicateFn(s)]; best = null; bs = 1e9;
        for (k = 0; k < cl.length; k++) {
          if (!cl[k]) continue;
          if (!syntaxErr(cl[k].text)) { best = cl[k]; break; }
          sc = score(cl[k].text);
          if (sc < cur && sc < bs) { best = cl[k]; bs = sc; }
        }
        c = best;
      }
      if (!c) break;
      s = c.text; cur = score(s); notes.push(c.note);
      if (!syntaxErr(s)) return { ok: true, text: s, notes: notes };
    }
    return { ok: false, why: 'I could not fix this automatically (' + ((syntaxErr(String(src).replace(/\r\n?/g, '\n')) || {}).message || 'unknown problem') + '). Open the file and check that spot.' };
  }
  window.__mbFixJs = fixJs;
  window.__mbErrClose = close;


  /* ---------- More menu: Create TXT, Fix Error, Copy all ---------- */
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function reportText() {
    var nm = (typeof currentProjectName === 'function' ? currentProjectName() : 'project');
    var out = 'Multi Bundle Error Report\nProject: ' + nm + '\nTime: ' + new Date().toISOString() + '\nProblems: ' + list.length + '\n';
    list.forEach(function (e, i) {
      out += '\n' + '='.repeat(40) + '\n' + (i + 1) + '. ' + e.title + '\n' + e.msg + '\n' +
        (e.where ? plainText(e.where) + '\n' : '') + (e.raw ? '\n' + e.raw : '') + (e.plain ? '\n' + e.plain + '\n' : '');
    });
    return out;
  }
  function doTxt() {
    var nm = (typeof currentProjectName === 'function' ? currentProjectName() : 'project');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([reportText()], { type: 'text/plain' }));
    a.download = String(nm).replace(/[^\w\-]+/g, '_') + '-errors.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Error report saved as TXT', 'success');
  }
  function doCopy() {
    var txt = list.map(function (e, i) {
      return (list.length > 1 ? (i + 1) + '. ' : '') + e.title + '\n' + e.msg + (e.where ? '\n' + plainText(e.where) : '') + (e.plain ? '\n' + e.plain : '');
    }).join('\n\n');
    try { navigator.clipboard.writeText(txt); toast('Copied', 'success'); } catch (x) {}
  }
  /* Fix an inline <script> inside an .html file: find the script that holds the error line and repair only that part */
  function fixHtml(text, line) {
    var t = String(text).replace(/\r\n?/g, '\n'), ls = lineStart(t, line || 1);
    if (ls < 0) return { ok: false, why: 'Could not find line ' + line + '.' };
    var tag = t.lastIndexOf('<script', ls + 1); if (tag < 0) return { ok: false, why: 'The error line is not inside a script.' };
    var open = t.indexOf('>', tag) + 1, end = t.indexOf('</script>', open);
    if (end < 0 || ls > end) return { ok: false, why: 'The error line is not inside a script.' };
    if (/\bsrc\s*=/i.test(t.slice(tag, open))) return { ok: false, why: 'The error line is not inside a script.' };
    var rel = (t.slice(open, Math.max(ls, open)).match(/\n/g) || []).length + 1;
    var r = fixJs(t.slice(open, end), rel);
    if (!r.ok) return r;
    return { ok: true, text: t.slice(0, open) + r.text + t.slice(end), notes: r.notes };
  }
  /* Inline classic scripts of an html text: [{open, end}] */
  function jsBlocks(t) {
    var out = [], re = /<script\b([^>]*)>/gi, m, open, end, ty;
    while ((m = re.exec(t))) {
      open = m.index + m[0].length; end = t.indexOf('</script>', open); if (end < 0) end = t.length;
      re.lastIndex = end;
      if (/\bsrc\s*=/i.test(m[1])) continue;
      ty = m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
      if (ty && !/javascript|ecmascript/i.test(ty[1])) continue;
      if (!t.slice(open, end).trim()) continue;
      out.push({ open: open, end: end });
    }
    return out;
  }
  function blockLine(t, bl, errs) {
    var k, ls, tl = t.lastIndexOf('\n', bl.open - 1) + 1;
    for (k = 0; k < errs.length; k++) {
      ls = lineStart(t, errs[k].line);
      if (ls >= tl && ls <= bl.end) return ls < bl.open ? 1 : (t.slice(bl.open, ls).match(/\n/g) || []).length + 1;
    }
    return 0;
  }
  /* Check EVERY .js file and every inline script of every .html file. Fix what can be fixed, explain the rest. */
  function fixAll(fl, curText, entries) {
    var fixed = [], stuck = [], out = [], seen = {};
    fl.forEach(function (f) {
      if (!f || f.text == null || !/\.(js|html?)$/i.test(f.path)) return;
      var before = curText(f), t = String(before).replace(/\r\n?/g, '\n'), name = base(f.path), changed = false, r, b, bl, blk, tag;
      var errs = entries.filter(function (e) { return e.path === f.path && e.line; });
      if (/\.js$/i.test(f.path)) {
        if (/^\s*(import|export)\s/m.test(t) || !syntaxErr(t)) return;
        seen[f.path] = 1;
        r = fixJs(t, errs.length ? errs[0].line : 0);
        if (r.ok) { t = r.text; changed = true; fixed.push(name + ': ' + r.notes.join(', ')); } else stuck.push(name + ': ' + r.why);
      } else {
        bl = jsBlocks(t);
        for (b = bl.length - 1; b >= 0; b--) {
          blk = t.slice(bl[b].open, bl[b].end);
          if (/^\s*(import|export)\s/m.test(blk) || !syntaxErr(blk)) continue;
          seen[f.path] = 1; tag = name + ' (script ' + (b + 1) + ' of ' + bl.length + ')';
          r = fixJs(blk, blockLine(t, bl[b], errs));
          if (r.ok) { t = t.slice(0, bl[b].open) + r.text + t.slice(bl[b].end); changed = true; fixed.push(tag + ': ' + r.notes.join(', ')); }
          else stuck.push(tag + ': ' + r.why);
        }
      }
      if (changed) out.push({ f: f, text: t, before: before });
    });
    entries.forEach(function (e) {
      if (e.path && seen[e.path]) return;
      stuck.push((e.path ? base(e.path) + (e.line ? ' line ' + e.line : '') + ': ' : '') + e.msg + ' - ' + (e.plain || 'The cause is not clear. Check the code at that spot.') + ' This is not a typing mistake, so I cannot fix it automatically.');
    });
    return { fixed: fixed, stuck: stuck, files: out };
  }
  function showReport(fixed, stuck) {
    var old = $('mbFixRep'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'mbFixRep';
    ov.style.cssText = 'position:fixed;inset:0;z-index:470;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;padding:12px';
    function rows(a) { return a.map(function (x) { return '<div style="font-size:13px;line-height:1.5;padding:7px 0;border-top:1px solid #2a2b32;overflow-wrap:anywhere">' + esc(x) + '</div>'; }).join(''); }
    function head(t, c) { return '<div style="font-size:11px;font-weight:800;letter-spacing:1px;color:' + c + ';margin:10px 0 2px">' + t + '</div>'; }
    var h = '<div style="width:100%;max-width:520px;max-height:75vh;overflow:auto;background:#17181c;border:1px solid #2e2f36;border-radius:16px;padding:14px;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.55)">' +
      '<div style="font-size:15px;font-weight:800">Fix Error result</div>';
    if (fixed.length) h += head('FIXED (' + fixed.length + ')', '#7dd68e') + rows(fixed);
    if (stuck.length) h += head('COULD NOT FIX (' + stuck.length + ')', '#ffd166') + rows(stuck);
    if (!fixed.length && !stuck.length) h += '<div style="font-size:13px;padding:8px 0">No problems found in any .js file or script.</div>';
    if (fixed.length) h += '<div style="font-size:12px;color:#a2a3ad;margin-top:10px">Run the preview again to check.</div>';
    h += '<button id="mbFixRepX" style="width:100%;margin-top:12px;padding:11px;border-radius:10px;border:1px solid #303139;background:#20222a;color:#fff;font-size:14px;font-weight:700;font-family:inherit">OK</button></div>';
    ov.innerHTML = h; document.body.appendChild(ov);
    ov.onclick = function (e) { if (e.target === ov || e.target.id === 'mbFixRepX') ov.remove(); };
  }
  async function doFix() {
    if (localStorage.getItem('mb_ed_autofix') === '0') { toast('Auto Fix Error is off. Turn it on in Editor settings.', 'error'); return; }
    var fl = (typeof files !== 'undefined' && files) ? files : [];
    var sel = $('editorFileSelect'), ta = $('editorTextarea');
    var res = fixAll(fl, function (f) { return (sel && ta && sel.value === f.path) ? ta.value : f.text; }, list.slice());
    var last = '', k, f, reopen = false;
    for (k = 0; k < res.files.length; k++) {
      f = res.files[k].f;
      try { localStorage.setItem('mb_prefix_' + f.path, res.files[k].before); } catch (x) {}
      f.text = res.files[k].text; f.blob = null; f.size = f.text.length;
      try { if (typeof currentProjectId !== 'undefined') localStorage.removeItem('mb_draft_' + currentProjectId + '_' + f.path); } catch (x) {}
      if (f.uri && window.FolderAccess && FolderAccess.available) { try { await FolderAccess.saveFile(f, f.text); } catch (x) {} }
      if (sel && sel.value === f.path) reopen = true;
      last = f.path;
    }
    close();
    if (res.files.length) {
      if (reopen && window.__edOpenFile) { try { window.__edOpenFile(sel.value); } catch (x) {} }
      try { if (typeof window.saveCurrentProject === 'function') await window.saveCurrentProject(); } catch (x) {}
      try { if (typeof window.logHistory === 'function') window.logHistory({ type: 'edit', path: last, note: 'Fix Error: ' + res.fixed.join('; ') }); } catch (x) {}
    }
    showReport(res.fixed, res.stuck);
  }
  async function doFixOld() {
    var todo = [], seenP = {};
    list.forEach(function (e) { if (e.path && /\.(js|html?)$/i.test(e.path) && !seenP[e.path]) { seenP[e.path] = 1; todo.push(e); } });
    if (!todo.length) { toast('Fix Error works on errors inside a .js or .html file', 'error'); return; }
    var fl = (typeof files !== 'undefined' && files) ? files : [];
    var sel = $('editorFileSelect'), ta = $('editorTextarea'), done = [], fails = [], last = '', fixedFiles = [];
    todo.forEach(function (e) {
      var f = fl.find(function (x) { return x.path === e.path; }); if (!f || f.text == null) return;
      var cur = (sel && ta && sel.value === e.path) ? ta.value : f.text;
      var r = /\.html?$/i.test(e.path) ? fixHtml(cur, e.line) : fixJs(cur, e.line);
      if (!r.ok) { fails.push(base(e.path) + ': ' + r.why); return; }
      try { localStorage.setItem('mb_prefix_' + e.path, cur); } catch (x) {}
      f.text = r.text; f.blob = null; f.size = r.text.length; fixedFiles.push(f);
      try { if (typeof currentProjectId !== 'undefined') localStorage.removeItem('mb_draft_' + currentProjectId + '_' + e.path); } catch (x) {}
      done.push(base(e.path) + ': ' + r.notes.join(', ')); last = e.path;
    });
    if (!done.length) { toast(fails[0] || 'Nothing to fix', 'error'); return; }
    for (var q = 0; q < fixedFiles.length; q++) {
      if (fixedFiles[q].uri && window.FolderAccess && FolderAccess.available) { try { await FolderAccess.saveFile(fixedFiles[q], fixedFiles[q].text); } catch (x) {} }
    }
    close();
    if (last && window.__edOpenFile && sel && sel.value === last) { try { window.__edOpenFile(last); } catch (x) {} }
    try { if (typeof window.saveCurrentProject === 'function') await window.saveCurrentProject(); } catch (x) {}
    try { if (typeof window.logHistory === 'function') window.logHistory({ type: 'edit', path: last, note: 'Fix Error: ' + done.join('; ') }); } catch (x) {}
    toast('Fixed. ' + done.join(' | ') + '. Run the preview again.', 'success');
  }
  function mArr(on) { var s = $('mbeMoreArr'); if (s) s.style.transform = on ? 'rotate(180deg)' : 'rotate(0deg)'; }
  function hideStoreKey() {
    var id = (typeof currentProjectId !== 'undefined' && currentProjectId) ? currentProjectId : (typeof currentProjectName === 'function' ? currentProjectName() : 'app');
    return 'mb_err_hidden_' + id;
  }
  function hideKeyOf(e) { return [e.kind, e.msg, e.path].join('|'); }
  function hiddenList() { try { return JSON.parse(localStorage.getItem(hideStoreKey()) || '[]'); } catch (x) { return []; } }
  function isHidden(e) { return hiddenList().indexOf(hideKeyOf(e)) > -1; }
  function hideAt(i) {
    var en = list[i]; if (!en) return;
    var hl = hiddenList(), k = hideKeyOf(en);
    if (hl.indexOf(k) < 0) hl.push(k);
    try { localStorage.setItem(hideStoreKey(), JSON.stringify(hl)); } catch (x) {}
    list = list.filter(function (x) { return hideKeyOf(x) !== k; });
    render();
    toast('This message is hidden for this app', 'success');
  }
  function doHide() { hideAt(0); }
  function doHideAll() {
    if (!list.length) return;
    var hl = hiddenList(), n = list.length;
    list.forEach(function (e) { var k = hideKeyOf(e); if (hl.indexOf(k) < 0) hl.push(k); });
    try { localStorage.setItem(hideStoreKey(), JSON.stringify(hl)); } catch (x) {}
    close();
    toast(n > 1 ? 'These messages are hidden for this app' : 'This message is hidden for this app', 'success');
  }
  function openMore(btn) {
    var old = $('mbeMore'); if (old) { old.remove(); mArr(false); return; }
    var r = btn.getBoundingClientRect();
    var ov = document.createElement('div'); ov.id = 'mbeMore';
    ov.style.cssText = 'position:fixed;inset:0;z-index:460';
    var card = document.createElement('div');
    card.style.cssText = 'position:absolute;bottom:' + (window.innerHeight - r.top + 6) + 'px;left:' + Math.max(10, r.left) + 'px;width:230px;background:#1c1d22;border:1px solid #2e2f36;border-radius:14px;padding:6px;box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:system-ui,sans-serif;color:#fff';
    function ic(d, col) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
    var items = [
      ['txt', 'Create TXT', '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', '#7dd68e'],
      ['fix', 'Fix Error', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.3-.7-.7-2.3z"/>', '#ffd166'],
      ['hide', 'Hide Massage', '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>', '#ff9aa2'],
      ['copy', 'Copy all', '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', '#7ec8ff']
    ];
    if (localStorage.getItem('mb_ed_autofix') === '0') items = items.filter(function (it) { return it[0] !== 'fix'; });
    card.innerHTML = items.map(function (it) {
      return '<button data-m="' + it[0] + '" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 10px;border:0;border-radius:10px;background:transparent;color:#f0f0f2;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left">' + ic(it[2], it[3]) + '<span>' + it[1] + '</span></button>';
    }).join('');
    ov.appendChild(card); document.body.appendChild(ov);
    mArr(true);
    ov.onclick = function (e) { if (e.target === ov) { ov.remove(); mArr(false); } };
    var ACT = { txt: doTxt, fix: doFix, hide: doHideAll, copy: doCopy };
    card.querySelectorAll('[data-m]').forEach(function (b) {
      b.onclick = function () { ov.remove(); mArr(false); ACT[b.getAttribute('data-m')](); };
    });
  }

  function injectCss() {
    if ($('mbErrCss')) return;
    var st = document.createElement('style'); st.id = 'mbErrCss';
    st.textContent = [
      '#mbErrPanel{position:fixed;left:10px;right:10px;bottom:88px;z-index:450;max-height:60vh;overflow:auto;background:#1a1114;border:1px solid #6b1a22;border-radius:14px;padding:12px 14px;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.6)}',
      '@media(min-width:850px){#mbErrPanel{left:206px;right:16px;bottom:16px}}',
      '#mbErrPanel .mbe-t{font-size:10px;font-weight:800;letter-spacing:1.2px;color:#ff6b75}',
      '#mbErrPanel .mbe-f{font-size:12px;color:#a2a3ad;margin:6px 0 2px;line-height:1.6;overflow-wrap:anywhere}',
      '#mbErrPanel .mbe-f b{color:#fff}',
      '#mbErrPanel .mbe-i{padding:8px 0 4px}',
      '#mbErrPanel .mbe-i+.mbe-i{border-top:1px solid #3a1d22;margin-top:6px}',
      '#mbErrPanel .mbe-n{font-size:10px;font-weight:800;letter-spacing:1px;color:#ff9aa2;margin-bottom:2px}',
      '#mbErrPanel .mbe-m{font-size:14px;font-weight:800;margin:2px 0 6px;overflow-wrap:anywhere}',
      '#mbErrPanel .mbe-w{font-size:12px;color:#a2a3ad;margin-bottom:6px;overflow-wrap:anywhere}',
      '#mbErrPanel .mbe-w b{color:#fff}',
      '#mbErrPanel .mbe-c{margin:0 0 8px;padding:8px 0;background:#0f1013;border:1px solid #2a2b32;border-radius:8px;font:11px/1.55 ui-monospace,Menlo,Consolas,monospace;overflow-x:auto;white-space:pre}',
      '#mbErrPanel .mbe-c span{display:block;padding:0 8px;color:#a2a3ad}',
      '#mbErrPanel .mbe-c span.bad{background:rgba(240,20,36,.28);color:#fff}',
      '#mbErrPanel .mbe-h{font-size:12px;color:#ffd166;margin-bottom:8px;line-height:1.45}',
      '#mbErrPanel .mbe-b{display:flex;gap:6px;margin-top:6px}',
      '#mbErrPanel button{padding:8px 10px;border-radius:9px;border:1px solid #303139;background:#20222a;color:#e6e6e8;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer}',
      '#mbErrPanel .mbe-b button{flex:1}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function render() {
    if (!list.length) { if (panel) { panel.remove(); panel = null; } return; }
    injectCss();
    var counts = {}, order = [];
    list.forEach(function (e) {
      if (!e.path) return;
      if (!counts[e.path]) { counts[e.path] = 0; order.push(e.path); }
      counts[e.path]++;
    });
    var many = list.length > 1;
    var h = '<div class="mbe-t">' + (many ? list.length + ' PROBLEMS FOUND' : list[0].title) + '</div>';
    if (many && order.length) {
      h += '<div class="mbe-f">Files with errors: ' + order.map(function (p) {
        return '<b>' + esc(p) + '</b>' + (counts[p] > 1 ? ' (' + counts[p] + ')' : '');
      }).join(' \u00b7 ') + '</div>';
    }
    list.forEach(function (e, i) {
      h += '<div class="mbe-i">' +
        (many ? '<div class="mbe-n">' + (i + 1) + ' \u00b7 ' + e.title + '</div>' : '') +
        '<div class="mbe-m">' + esc(e.msg) + '</div>' +
        (e.where ? '<div class="mbe-w">' + e.where + '</div>' : '') +
        (e.code ? '<div class="mbe-c">' + e.code + '</div>' : '') +
        (e.plain ? '<div class="mbe-h">' + esc(e.plain) + '</div>' : '') +
        (e.path ? '<button data-a="open" data-i="' + i + '">Open ' + esc(base(e.path)) + '</button>' : '') +
      '</div>';
    });
    h += '<div class="mbe-b"><button data-a="more" style="display:inline-flex;align-items:center;justify-content:center;gap:6px">More<svg id="mbeMoreArr" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s ease;transform:rotate(0deg)"><polyline points="6 9 12 15 18 9"/></svg></button><button data-a="close">Close</button></div>';
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mbErrPanel';
      panel.onclick = onTap;
      document.body.appendChild(panel);
    }
    panel.innerHTML = h;
  }

  function onTap(ev) {
    var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
    var a = t.getAttribute('data-a');
    if (a === 'close') { close(); return; }
    if (a === 'more') { openMore(t); return; }
    if (a === 'hide1') { hideAt(parseInt(t.getAttribute('data-i'), 10)); return; }
    if (a === 'open') {
      var en = list[parseInt(t.getAttribute('data-i'), 10)]; if (!en || !en.path) return;
      var p = en.path;
      close();
      if (typeof showTab === 'function') { try { showTab('editor'); } catch (x) {} }
      var s = $('editorFileSelect');
      if (s) { s.value = p; s.dispatchEvent(new Event('change')); }
    }
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data; if (!d || d.type !== 'mb-err') return;
    if (d.id !== curId) { curId = d.id; list = []; }
    var en = entryOf(d);
    if (isHidden(en)) return;
    if (en.kind === 'blank') { if (list.length) return; }
    else list = list.filter(function (x) { return x.kind !== 'blank'; });
    if (list.some(function (x) { return x.key === en.key; })) return;
    list.push(en);
    render();
  });

  /* Add the watcher to every page that Multi Bundle previews */
  var orig = window.htmlRewrite;
  if (typeof orig === 'function') {
    window.htmlRewrite = function () {
      var out = orig.apply(this, arguments);
      try {
        close();
        var id = ++seq;
        var inj = '<script>' + CATCHER.replace('__ID__', id) + '<\/script>';
        out = out.replace(/<head[^>]*>/i, function (m) { return m + inj; });
        docs[id] = out; delete docs[id - 8];
      } catch (x) {}
      return out;
    };
  }
})();
