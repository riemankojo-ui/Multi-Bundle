(function () {
  var ta = document.getElementById('editorTextarea');
  if (!ta || !ta.parentNode) return;
  var wrap = ta.parentNode;
  var hl = wrap.querySelector('.editor-hl');
  var st = document.createElement('style');
  st.textContent = '.editor-code #editorTextarea{caret-color:transparent!important}' +
    '#mbCaret{position:absolute;z-index:3;width:2px;border-radius:1px;background:#aeb2bd;pointer-events:none;display:none;animation:mbBlink 1s steps(1) infinite}' +
    '@keyframes mbBlink{50%{opacity:0}}';
  document.head.appendChild(st);
  var c = document.createElement('div');
  c.id = 'mbCaret';
  wrap.appendChild(c);
  var m = document.createElement('div');
  m.style.cssText = 'position:absolute;visibility:hidden;top:0;left:0;pointer-events:none;overflow:hidden;height:0;box-sizing:content-box;border:0';
  wrap.appendChild(m);
  var P = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'tabSize', 'textIndent', 'wordSpacing', 'whiteSpace', 'wordBreak', 'overflowWrap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  var lx = -1, ly = -1;

  function viaHL(pos) {
    if (!hl) return null;
    var w = document.createTreeWalker(hl, NodeFilter.SHOW_TEXT, null), n, left = pos, last = null, hit = null, off = 0;
    while ((n = w.nextNode())) {
      var L = n.nodeValue.length;
      last = n;
      if (left < L) { hit = n; off = left; break; }
      left -= L;
    }
    if (!hit && last) { hit = last; off = last.nodeValue.length; }
    if (!hit) return null;
    var r = document.createRange();
    r.setStart(hit, off);
    r.collapse(true);
    var rc = r.getClientRects()[0] || r.getBoundingClientRect();
    if (!rc || !rc.height) return null;
    var wr = wrap.getBoundingClientRect();
    return { x: rc.left - wr.left, y: rc.top - wr.top, h: rc.height };
  }

  function viaMirror(pos, cs) {
    P.forEach(function (k) { m.style[k] = cs[k]; });
    var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
    m.style.width = Math.max(10, ta.clientWidth - pl - pr) + 'px';
    m.textContent = '';
    m.appendChild(document.createTextNode(ta.value.slice(0, pos)));
    var s = document.createElement('span');
    s.textContent = '\u200b';
    m.appendChild(s);
    var h = s.offsetHeight || 18;
    return { x: ta.offsetLeft + s.offsetLeft - ta.scrollLeft, y: ta.offsetTop + s.offsetTop - ta.scrollTop, h: h };
  }

  function draw() {
    if (document.activeElement !== ta || ta.selectionStart !== ta.selectionEnd) { c.style.display = 'none'; return; }
    var pos = ta.selectionStart;
    var p = viaHL(pos) || viaMirror(pos, getComputedStyle(ta));
    if (p.y < -p.h || p.y > wrap.clientHeight) { c.style.display = 'none'; return; }
    c.style.display = 'block';
    c.style.left = p.x + 'px';
    var lh = parseFloat(getComputedStyle(ta).lineHeight) || p.h * 1.3, hh = Math.max(p.h, lh) + 12;
    c.style.top = (p.y - (hh - p.h) / 2) + 'px';
    c.style.height = hh + 'px';
    if (p.x !== lx || p.y !== ly) { lx = p.x; ly = p.y; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
  }

  var raf = 0;
  function sched() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; try { draw(); } catch (e) {} });
  }
  document.addEventListener('selectionchange', sched);
  ['input', 'keyup', 'click', 'focus', 'blur', 'scroll', 'touchend', 'pointerup'].forEach(function (n) { ta.addEventListener(n, sched, { passive: true }); });
  window.addEventListener('resize', sched);
  setInterval(sched, 400);
})();