/* Multi Bundle - Preview error watcher.
   When a previewed page breaks or stays blank, show the file, the line and the likely cause. */
(function () {
  'use strict';
  if (window.__mbErrWatch) return;
  window.__mbErrWatch = 1;

  /* Code that runs inside the preview page and reports problems back to Multi Bundle */
  var CATCHER = '(function(){var ID=__ID__,n=0;' +
    'function send(o){if(n>=5)return;n++;o.type="mb-err";o.id=ID;try{parent.postMessage(o,"*")}catch(x){}}' +
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

  var seq = 0, docs = {}, panel = null, lastKey = '', lastAt = 0;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function norm(s) { return String(s).replace(/\r\n?/g, '\n'); }
  function pad(n) { n = String(n); while (n.length < 4) n = ' ' + n; return n; }

  function close() { if (panel) { panel.remove(); panel = null; } }

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
    var list = (typeof files !== 'undefined' && files) ? files : [];
    var f = null, off = 0, tx, at;
    for (i = 0; i < list.length && !f; i++) {
      tx = list[i].text; if (tx == null) continue;
      if (norm(tx) === block) { f = list[i]; off = 0; }
    }
    for (i = 0; i < list.length && !f; i++) {
      tx = list[i].text; if (tx == null) continue;
      tx = norm(tx); at = tx.indexOf(block);
      if (at > -1) { f = list[i]; off = (tx.slice(0, at).match(/\n/g) || []).length; }
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
    if (/Unexpected token|Unexpected end|Unexpected identifier|missing \)|Invalid or unexpected|Unexpected string/.test(m)) return 'A typing mistake in the code, like a missing bracket, quote or comma. Look at this line and the one just above it.';
    if (/Assignment to constant/.test(m)) return 'A "const" value was changed. Use "let" instead of "const" for values that change.';
    if (/has already been declared/.test(m)) return 'The same name is created twice. Rename one of them or remove the duplicate.';
    if (/Failed to fetch|NetworkError|Load failed/.test(m)) return 'A network request failed. A preview cannot reach some servers, or the address is wrong.';
    if (/Unexpected token '<'/.test(m)) return 'A script file contains HTML instead of code. The script path is probably wrong.';
    return '';
  }

  function injectCss() {
    if ($('mbErrCss')) return;
    var st = document.createElement('style'); st.id = 'mbErrCss';
    st.textContent = [
      '#mbErrPanel{position:fixed;left:10px;right:10px;bottom:88px;z-index:450;max-height:58vh;overflow:auto;background:#1a1114;border:1px solid #6b1a22;border-radius:14px;padding:12px 14px;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.6)}',
      '@media(min-width:850px){#mbErrPanel{left:206px;right:16px;bottom:16px}}',
      '#mbErrPanel .mbe-t{font-size:10px;font-weight:800;letter-spacing:1.2px;color:#ff6b75}',
      '#mbErrPanel .mbe-m{font-size:14px;font-weight:800;margin:4px 0 6px;overflow-wrap:anywhere}',
      '#mbErrPanel .mbe-w{font-size:12px;color:#a2a3ad;margin-bottom:6px;overflow-wrap:anywhere}',
      '#mbErrPanel .mbe-w b{color:#fff}',
      '#mbErrPanel .mbe-c{margin:0 0 8px;padding:8px 0;background:#0f1013;border:1px solid #2a2b32;border-radius:8px;font:11px/1.55 ui-monospace,Menlo,Consolas,monospace;overflow-x:auto;white-space:pre}',
      '#mbErrPanel .mbe-c span{display:block;padding:0 8px;color:#a2a3ad}',
      '#mbErrPanel .mbe-c span.bad{background:rgba(240,20,36,.28);color:#fff}',
      '#mbErrPanel .mbe-h{font-size:12px;color:#ffd166;margin-bottom:8px;line-height:1.45}',
      '#mbErrPanel .mbe-b{display:flex;gap:6px}',
      '#mbErrPanel .mbe-b button{flex:1;padding:8px 4px;border-radius:9px;border:1px solid #303139;background:#20222a;color:#e6e6e8;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function show(d) {
    close(); injectCss();
    var kind = d.kind, title, msg = String(d.msg || ''), where = '', code = '', path = '', plain = '';
    msg = msg.replace(/^Uncaught\s+/, '');
    if (kind === 'load') {
      title = 'FILE NOT LOADED';
      var u = String(d.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/^about:srcdoc\/?/, '');
      msg = 'Could not load ' + (u || 'a file');
      where = 'A <b>' + esc(String(d.tag || '').toLowerCase()) + '</b> tag points to a file that is missing or cannot be opened.';
      plain = 'Check that the file is in the project and the path and spelling match. Capital letters matter.';
    } else if (kind === 'blank') {
      title = 'PAGE LOOKS BLANK';
      msg = 'The page loaded but shows nothing';
      plain = hint('', 'blank');
    } else {
      title = kind === 'promise' ? 'A TASK FAILED' : 'ERROR IN YOUR CODE';
      var loc = locate(d.id, d.line);
      if (loc) {
        path = loc.path;
        where = 'In <b>' + esc(loc.path) + '</b> \u00b7 line <b>' + loc.line + '</b>';
        var a = Math.max(1, loc.line - 1), b = Math.min(loc.lines.length, loc.line + 1);
        for (var n = a; n <= b; n++) {
          var tx = loc.lines[n - 1] || ''; if (tx.length > 160) tx = tx.slice(0, 160) + '\u2026';
          code += '<span' + (n === loc.line ? ' class="bad"' : '') + '>' + pad(n) + '  ' + esc(tx) + '</span>';
        }
      } else if (d.line) {
        where = 'Line <b>' + d.line + '</b> of the preview page';
        var dl = (docs[d.id] || '').split('\n')[d.line - 1];
        if (dl) { dl = dl.trim(); if (dl.length > 160) dl = dl.slice(0, 160) + '\u2026'; code = '<span class="bad">' + esc(dl) + '</span>'; }
      }
      plain = hint(msg, kind);
    }
    var summary = title + '\n' + msg + (where ? '\n' + where.replace(/<[^>]+>/g, '') : '') + (plain ? '\n' + plain : '');
    panel = document.createElement('div');
    panel.id = 'mbErrPanel'; panel.setAttribute('data-id', String(d.id));
    panel.innerHTML =
      '<div class="mbe-t">' + title + '</div>' +
      '<div class="mbe-m">' + esc(msg) + '</div>' +
      (where ? '<div class="mbe-w">' + where + '</div>' : '') +
      (code ? '<div class="mbe-c">' + code + '</div>' : '') +
      (plain ? '<div class="mbe-h">' + esc(plain) + '</div>' : '') +
      '<div class="mbe-b">' +
        (path ? '<button data-a="open">Open file</button>' : '') +
        '<button data-a="copy">Copy</button><button data-a="close">Close</button></div>';
    panel.onclick = function (e) {
      var t = e.target.closest ? e.target.closest('[data-a]') : null; if (!t) return;
      var a2 = t.getAttribute('data-a');
      if (a2 === 'close') close();
      else if (a2 === 'copy') {
        try { navigator.clipboard.writeText(summary); if (window.showToast) window.showToast('Copied', 'success'); } catch (x) {}
      } else if (a2 === 'open') {
        close();
        if (typeof showTab === 'function') { try { showTab('editor'); } catch (x) {} }
        var s = $('editorFileSelect');
        if (s) { s.value = path; s.dispatchEvent(new Event('change')); }
      }
    };
    document.body.appendChild(panel);
  }

  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || d.type !== 'mb-err') return;
    var key = d.kind + '|' + d.msg + '|' + d.line + '|' + d.url;
    if (key === lastKey && Date.now() - lastAt < 1500) return;
    lastKey = key; lastAt = Date.now();
    if (d.kind === 'blank' && panel && panel.getAttribute('data-id') === String(d.id)) return;
    show(d);
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
