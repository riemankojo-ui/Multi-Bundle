/* Multi Bundle - Logo crop.
   Tap a logo in the file picker (Logos) to crop it: Free or a fixed shape, then save a copy or replace the file. */
(function () {
  'use strict';
  if (window.__mbLogoCrop) return;

  /* ---------- geometry (pure functions) ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Largest centered rectangle with ratio r (width / height) that fits inside W x H */
  function fitRatio(W, H, r) {
    var w = W, h = w / r;
    if (h > H) { h = H; w = h * r; }
    return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
  }

  function moveRect(s, dx, dy, W, H) {
    return { x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h), w: s.w, h: s.h };
  }

  /* Resize from handle hd (tl t tr r br b bl l). px, py = wanted edge position in image pixels.
     r = null (free) or a fixed width / height ratio (corners only). */
  function sizeRect(hd, s, px, py, W, H, r, min) {
    var x1, y1, x2, y2;
    if (!r) {
      x1 = s.x; y1 = s.y; x2 = s.x + s.w; y2 = s.y + s.h;
      if (hd.indexOf('l') > -1) x1 = clamp(px, 0, x2 - min);
      if (hd.indexOf('r') > -1) x2 = clamp(px, x1 + min, W);
      if (hd.indexOf('t') > -1) y1 = clamp(py, 0, y2 - min);
      if (hd.indexOf('b') > -1) y2 = clamp(py, y1 + min, H);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    var sx = hd.indexOf('r') > -1 ? 1 : -1, sy = hd.indexOf('b') > -1 ? 1 : -1;
    var ax = sx > 0 ? s.x : s.x + s.w, ay = sy > 0 ? s.y : s.y + s.h;
    var maxW = Math.min(sx > 0 ? W - ax : ax, (sy > 0 ? H - ay : ay) * r);
    var minW = Math.min(Math.max(min, min * r), maxW);
    var rawW = Math.max(0, sx * (px - ax)), rawH = Math.max(0, sy * (py - ay));
    var w = clamp(Math.max(rawW, rawH * r), minW, maxW), h = w / r;
    return { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w: w, h: h };
  }

  /* Which part of the box did the finger touch? Box and point are in screen pixels. */
  function hitTest(bx, by, bw, bh, mx, my, free) {
    var T = Math.min(26, Math.min(bw, bh) / 3), nl = Math.abs(mx - bx) <= T, nr = Math.abs(mx - bx - bw) <= T,
      nt = Math.abs(my - by) <= T, nb = Math.abs(my - by - bh) <= T,
      inX = mx >= bx - T && mx <= bx + bw + T, inY = my >= by - T && my <= by + bh + T;
    if (nl && nt) return 'tl';
    if (nr && nt) return 'tr';
    if (nl && nb) return 'bl';
    if (nr && nb) return 'br';
    if (free) {
      if (nt && inX) return 't';
      if (nb && inX) return 'b';
      if (nl && inY) return 'l';
      if (nr && inY) return 'r';
    }
    if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) return 'move';
    return null;
  }

  /* Output size: n = 0 keeps the crop size, otherwise the longest side becomes n */
  function outSize(w, h, n) {
    if (!n) return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    var k = n / Math.max(w, h);
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /* An svg without a size gets one, so it can be drawn to a canvas */
  function svgSized(t) {
    var m = String(t).match(/<svg\b[^>]*>/i); if (!m) return t;
    var tag = m[0], vb = tag.match(/viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)/i);
    var w = 0, h = 0;
    if (vb) { w = parseFloat(vb[3]); h = parseFloat(vb[4]); }
    if (!(w > 0 && h > 0)) {
      var aw = tag.match(/\swidth\s*=\s*["']?([\d.]+)/i), ah = tag.match(/\sheight\s*=\s*["']?([\d.]+)/i);
      w = aw ? parseFloat(aw[1]) : 0; h = ah ? parseFloat(ah[1]) : 0;
    }
    if (!(w > 0 && h > 0)) { w = 1024; h = 1024; }
    var k = 1024 / Math.max(w, h), nw = Math.round(w * k), nh = Math.round(h * k);
    var clean = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    var nt = clean.replace(/<svg\b/i, '<svg width="' + nw + '" height="' + nh + '"');
    return String(t).replace(tag, nt);
  }

  window.__mbCropMath = { fitRatio: fitRatio, moveRect: moveRect, sizeRect: sizeRect, hitTest: hitTest, outSize: outSize, svgSized: svgSized };

  /* ---------- UI ---------- */
  function $(id) { return document.getElementById(id); }
  function toast(m, t) { if (window.showToast) window.showToast(m, t); }
  function extOf(p) { var m = String(p).match(/\.([^.\/]+)$/); return m ? m[1].toLowerCase() : ''; }

  var SHAPES = [['free', 'Free', null], ['1:1', '1:1', 1], ['4:3', '4:3', 4 / 3], ['3:4', '3:4', 3 / 4], ['16:9', '16:9', 16 / 9], ['9:16', '9:16', 9 / 16], ['same', 'Same', -1]];
  var FLIP = { '4:3': '3:4', '3:4': '4:3', '16:9': '9:16', '9:16': '16:9' };
  var SIZES = [[0, 'Original'], [1024, '1024'], [512, '512'], [192, '192']];

  function injectCss() {
    if ($('lcCss')) return;
    var st = document.createElement('style'); st.id = 'lcCss';
    st.textContent = [
      '#lcRoot{position:fixed;left:0;right:0;top:0;bottom:0;z-index:10020;background:#0d0e12;color:#fff;display:flex;flex-direction:column;font-family:system-ui,-apple-system,sans-serif;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);-webkit-user-select:none;user-select:none}',
      '#lcRoot button{font-family:inherit;color:#e6e6e8;background:#20222a;border:1px solid #303139;border-radius:10px;padding:8px 13px;font-size:13px;font-weight:700}',
      '#lcRoot button.on{background:#2a2c34;color:#f5d76e;border-color:#6b5a1a}',
      '#lcRoot button:disabled{opacity:.4}',
      '#lcRoot .lc-top{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #25262c}',
      '#lcRoot .lc-title{flex:1;min-width:0;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}',
      '#lcRoot .lc-stage{flex:1;min-height:0;position:relative;touch-action:none;overflow:hidden}',
      '#lcRoot .lc-img{position:absolute;background:repeating-conic-gradient(#3a3b44 0% 25%,#2b2c33 0% 50%) 50%/16px 16px}',
      '#lcRoot .lc-img canvas{display:block;width:100%;height:100%}',
      '#lcRoot .lc-box{position:absolute;box-sizing:border-box;border:2px solid #fff;box-shadow:0 0 0 4000px rgba(0,0,0,.6)}',
      '#lcRoot .lc-box.round{border-radius:50%}',
      '#lcRoot .lc-grid{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;background:linear-gradient(to right,transparent calc(33.33% - .5px),rgba(255,255,255,.35) 0 calc(33.33% + .5px),transparent 0 calc(66.66% - .5px),rgba(255,255,255,.35) 0 calc(66.66% + .5px),transparent 0),linear-gradient(to bottom,transparent calc(33.33% - .5px),rgba(255,255,255,.35) 0 calc(33.33% + .5px),transparent 0 calc(66.66% - .5px),rgba(255,255,255,.35) 0 calc(66.66% + .5px),transparent 0)}',
      '#lcRoot .lc-box.round .lc-grid{display:none}',
      '#lcRoot .lc-c{position:absolute;width:24px;height:24px;pointer-events:none;border:0 solid #f5d76e}',
      '#lcRoot .lc-c.tl{left:-4px;top:-4px;border-left-width:4px;border-top-width:4px}',
      '#lcRoot .lc-c.tr{right:-4px;top:-4px;border-right-width:4px;border-top-width:4px}',
      '#lcRoot .lc-c.bl{left:-4px;bottom:-4px;border-left-width:4px;border-bottom-width:4px}',
      '#lcRoot .lc-c.br{right:-4px;bottom:-4px;border-right-width:4px;border-bottom-width:4px}',
      '#lcRoot .lc-box.round .lc-c{display:none}',
      '#lcRoot .lc-e{position:absolute;pointer-events:none;background:#f5d76e;border-radius:2px}',
      '#lcRoot .lc-e.t{left:50%;top:-4px;width:28px;height:4px;margin-left:-14px}',
      '#lcRoot .lc-e.b{left:50%;bottom:-4px;width:28px;height:4px;margin-left:-14px}',
      '#lcRoot .lc-e.l{top:50%;left:-4px;width:4px;height:28px;margin-top:-14px}',
      '#lcRoot .lc-e.r{top:50%;right:-4px;width:4px;height:28px;margin-top:-14px}',
      '#lcRoot.fixed .lc-e{display:none}',
      '#lcRoot .lc-info{font-size:11px;color:#a2a3ad;text-align:center;padding:6px 10px 0}',
      '#lcRoot .lc-row{display:flex;gap:6px;padding:6px 10px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}',
      '#lcRoot .lc-row::-webkit-scrollbar{display:none}',
      '#lcRoot .lc-row button{flex:0 0 auto}',
      '#lcRoot .lc-lab{flex:0 0 52px;align-self:center;font-size:10px;font-weight:800;letter-spacing:1px;color:#8b8c96}',
      '#lcRoot .lc-act{display:flex;gap:8px;padding:8px 10px 10px;border-top:1px solid #25262c}',
      '#lcRoot .lc-act button{flex:1;padding:12px}',
      '#lcRoot .lc-act .lc-save{background:#CD853F;border-color:#CD853F;color:#fff}',
      '#lcRoot .lc-act{justify-content:center;padding:6px 10px 8px}',
      '#lcRoot .lc-act button{flex:0 0 auto;min-width:110px;padding:7px 20px;font-size:13px}',
      '#lcRoot .lc-box{border-width:1px}',
      '#lcRoot .lc-c{width:16px;height:16px}',
      '#lcRoot .lc-c.tl{left:-1px;top:-1px;border-left-width:2px;border-top-width:2px}',
      '#lcRoot .lc-c.tr{right:-1px;top:-1px;border-right-width:2px;border-top-width:2px}',
      '#lcRoot .lc-c.bl{left:-1px;bottom:-1px;border-left-width:2px;border-bottom-width:2px}',
      '#lcRoot .lc-c.br{right:-1px;bottom:-1px;border-right-width:2px;border-bottom-width:2px}',
      '#lcRoot .lc-e.t{top:-1px;height:2px}',
      '#lcRoot .lc-e.b{bottom:-1px;height:2px}',
      '#lcRoot .lc-e.l{left:-1px;width:2px}',
      '#lcRoot .lc-e.r{right:-1px;width:2px}',
'#lcRoot .lc-adj{padding:2px 10px 4px}',
'#lcRoot .lc-sl{display:flex;align-items:center;gap:8px;height:34px}',
'#lcRoot .lc-sl .n{flex:0 0 58px;font-size:11px;font-weight:800;color:#a2a3ad}',
'#lcRoot .lc-sl input[type=range]{flex:1;min-width:0;height:28px;accent-color:#CD853F;margin:0}',
'#lcRoot .lc-sl .v{flex:0 0 42px;text-align:right;font-size:11px;font-weight:700;color:#e6e6e8}',
'#lcRoot .lc-sl button{flex:0 0 auto;width:30px;height:30px;padding:0;font-size:16px;line-height:1}',
'#lcRoot .lc-sw{display:flex;gap:8px;align-items:center;height:40px;overflow-x:auto;scrollbar-width:none}',
'#lcRoot .lc-sw button{flex:0 0 auto;width:30px;height:30px;padding:0;border-radius:50%;border:2px solid #303139}',
'#lcRoot .lc-sw button.on{border-color:#f5d76e}',
'#lcRoot .lc-sw input[type=color]{flex:0 0 auto;width:34px;height:30px;padding:0;border:0;background:none}',
'#lcRoot .lc-load{position:absolute;left:0;right:0;top:0;bottom:0;z-index:20;background:#0d0e12;display:flex;align-items:center;justify-content:center}',
'#lcRoot .lc-load i{display:block;width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red,#f01424);border-radius:50%;animation:mb-spin .8s linear infinite}'
    ].join('\n');
    document.head.appendChild(st);
  }

  window.__mbLogoCrop = function (f, openCode) {
    injectCss();
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (x) {}
    var old = $('lcRoot'); if (old) old.remove();
    var isSvg = extOf(f.path) === 'svg';
    var S = { src: null, orig: null, W: 0, H: 0, rect: null, shape: 'free', ratio: null, size: 0, round: false, scale: 1, drag: null, busy: false, prev: null, prevFor: null, lay: 'logo', L: newL() };

    var root = document.createElement('div'); root.id = 'lcRoot'; root.className = '';
    root.innerHTML =
      '<div class="lc-top"><button id="lcX" type="button">Cancel</button><div class="lc-title"></div><button id="lcCode" type="button" hidden>Code</button></div>' +
      '<div class="lc-stage" id="lcStage"><div class="lc-img" id="lcImg"><canvas id="lcCv"></canvas>' +
        '<div class="lc-box" id="lcBox"><div class="lc-grid"></div><i class="lc-c tl"></i><i class="lc-c tr"></i><i class="lc-c bl"></i><i class="lc-c br"></i><i class="lc-e t"></i><i class="lc-e b"></i><i class="lc-e l"></i><i class="lc-e r"></i></div>' +
      '</div></div>' +
      '<div class="lc-info" id="lcInfo"></div>' +
      '<div class="lc-row" id="lcShape"><span class="lc-lab">SHAPE</span></div>' +
      '<div class="lc-row" id="lcSize"><span class="lc-lab">SIZE</span></div>' +
      '<div class="lc-row" id="lcLayer"><span class="lc-lab">LAYER</span></div>' +
'<div class="lc-adj" id="lcAdj"></div>' +
'<div class="lc-row" id="lcTools"><span class="lc-lab">TOOLS</span></div>' +
      '<div class="lc-act"><button id="lcRep" type="button" hidden>Replace</button><button id="lcCopy" type="button" class="lc-save">Save</button></div>' +
'<div class="lc-load" id="lcLoad"><i></i></div>';
    root.querySelector('.lc-title').textContent = f.path;
    document.body.appendChild(root);

    var stage = $('lcStage'), imgEl = $('lcImg'), cv = $('lcCv'), box = $('lcBox'), info = $('lcInfo'), rep = $('lcRep'), copy = $('lcCopy');
    var chips = {};
    function chip(row, key, label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn;
      $(row).appendChild(b); chips[key] = b; return b;
    }

    /* ----- output format ----- */
    function srcExt() { var e = extOf(f.path); return e === 'jpeg' ? 'jpg' : e; }
    function outType() {
      var e = srcExt();
      if (S.round) return 'image/png';
      if (e === 'jpg') return 'image/jpeg';
      if (e === 'webp') return 'image/webp';
      return 'image/png';
    }
    function typeExt(t) { return t === 'image/jpeg' ? 'jpg' : t === 'image/webp' ? 'webp' : 'png'; }

    /* ----- drawing ----- */
    function paint() {
      var s = S.scale, R = S.rect;
      box.style.left = (R.x * s) + 'px'; box.style.top = (R.y * s) + 'px';
      box.style.width = (R.w * s) + 'px'; box.style.height = (R.h * s) + 'px';
      box.className = 'lc-box' + (S.round ? ' round' : '');
      root.className = S.ratio ? 'fixed' : '';
      var o = outSize(R.w, R.h, S.size);
      info.textContent = 'Result: ' + o.w + ' x ' + o.h + ' px' + (S.round ? ' - round' : '') + ' - ' + typeExt(outType()).toUpperCase();
      rep.disabled = S.busy || isSvg || typeExt(outType()) !== (srcExt() === 'jpg' ? 'jpg' : srcExt());
      copy.disabled = S.busy;
    }
    function layout() {
      if (!S.src) return;
      var sw = stage.clientWidth, sh = stage.clientHeight; if (!sw || !sh) return;
      var pad = 16, s = Math.min((sw - pad * 2) / S.W, (sh - pad * 2) / S.H); if (!(s > 0)) return;
      S.scale = s;
      var dw = S.W * s, dh = S.H * s;
      imgEl.style.left = ((sw - dw) / 2) + 'px'; imgEl.style.top = ((sh - dh) / 2) + 'px';
      imgEl.style.width = dw + 'px'; imgEl.style.height = dh + 'px';
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(dw * dpr)); cv.height = Math.max(1, Math.round(dh * dpr));
      var x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.clearRect(0, 0, cv.width, cv.height);
      drawLayers(x, cv.width, cv.height, prevSrc());
      paint();
    }
    function mark() {
      Object.keys(chips).forEach(function (k) {
        var on = false;
        if (k.indexOf('s:') === 0) on = S.shape === k.slice(2);
        else if (k.indexOf('z:') === 0) on = S.size === parseInt(k.slice(2), 10);
        else if (k === 'round') on = S.round;
        chips[k].className = on ? 'on' : '';
      });
    }

    /* ----- shape / size / tools ----- */
    function setShape(key) {
      var sh = SHAPES.filter(function (x) { return x[0] === key; })[0]; if (!sh) return;
      S.shape = key;
      if (sh[2] == null) S.ratio = null;
      else {
        S.ratio = sh[2] === -1 ? S.W / S.H : sh[2];
        S.rect = fitRatio(S.W, S.H, S.ratio);
      }
      mark(); paint();
    }
    SHAPES.forEach(function (sh) { chip('lcShape', 's:' + sh[0], sh[1], function () { setShape(sh[0]); }); });
    SIZES.forEach(function (z) { chip('lcSize', 'z:' + z[0], z[1], function () { S.size = z[0]; mark(); paint(); }); });
    chip('lcTools', 'round', 'Round', function () { S.round = !S.round; mark(); paint(); });
    chip('lcTools', 'rot', 'Rotate', function () {
      var c = document.createElement('canvas'); c.width = S.H; c.height = S.W;
      var x = c.getContext('2d'); x.translate(S.H, 0); x.rotate(Math.PI / 2); x.drawImage(S.src, 0, 0);
      var R = S.rect, H0 = S.H;
      S.rect = { x: H0 - (R.y + R.h), y: R.x, w: R.h, h: R.w };
      S.src = c; S.W = c.width; S.H = c.height;
      if (S.shape === 'same') S.ratio = S.W / S.H;
      else if (S.ratio) { S.shape = FLIP[S.shape] || S.shape; S.ratio = 1 / S.ratio; if (S.shape === '1:1') S.ratio = 1; }
      mark(); layout();
    });
    chip('lcTools', 'reset', 'Reset', function () {
      S.src = S.orig; S.W = S.orig.width; S.H = S.orig.height;
      S.rect = { x: 0, y: 0, w: S.W, h: S.H }; S.shape = 'free'; S.ratio = null; S.size = 0; S.round = false; S.L = newL(); buildAdj();
      mark(); layout();
    });

    /* ----- layers ----- */
function newL() { return { bg: '', bg2: '', ang: 45, sc: 100, ox: 0, oy: 0, op: 100, rt: 0, tint: '', tn: 100, shb: 0, shd: 0, tx: '', tf: 0, tbold: 1, tital: 0, tc: '', tsz: 20, tox: 0, toy: 0, top: 100 }; }
function layersDefault() { return JSON.stringify(S.L) === JSON.stringify(newL()); }
var FONTS = [['Clean', 'system-ui,Arial,sans-serif'], ['Serif', 'Georgia,serif'], ['Mono', '"Courier New",monospace'], ['Bold', 'Impact,Arial Black,sans-serif'], ['Script', '"Brush Script MT","Segoe Script",cursive'], ['Round', '"Trebuchet MS",Verdana,sans-serif']];
function paintBg(x, w, h) {
  var L = S.L, c1 = L.bg || L.bg2, c2 = L.bg2 || L.bg;
  if (!c1) return;
  if (c1 === c2) { x.fillStyle = c1; x.fillRect(0, 0, w, h); return; }
  var a = L.ang * Math.PI / 180, dx = Math.sin(a), dy = Math.cos(a), r = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
  var g = x.createLinearGradient(w / 2 - dx * r, h / 2 - dy * r, w / 2 + dx * r, h / 2 + dy * r);
  g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.fillRect(0, 0, w, h);
}
var tc = { src: null, key: '', c: null };
function tintSrc(src) {
  var L = S.L; if (!L.tint || !L.tn) return src;
  var key = L.tint + '|' + L.tn;
  if (tc.src === src && tc.key === key) return tc.c;
  var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  var cx = c.getContext('2d'); cx.drawImage(src, 0, 0);
  cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = L.tn / 100; cx.fillStyle = L.tint; cx.fillRect(0, 0, c.width, c.height);
  tc.src = src; tc.key = key; tc.c = c; return c;
}
function drawText(x, w, h) {
  var L = S.L; if (!L.tx) return;
  var px = L.tsz / 100 * Math.min(w, h), f = FONTS[L.tf] || FONTS[0];
  x.save(); x.globalAlpha = L.top / 100; x.fillStyle = L.tc || '#ffffff';
  x.font = (L.tital ? 'italic ' : '') + (L.tbold ? '700 ' : '400 ') + px + 'px ' + f[1];
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(L.tx, w / 2 + L.tox / 100 * w, h / 2 + L.toy / 100 * h);
  x.restore();
}
function drawLayers(x, w, h, src) {
  var L = S.L, k = L.sc / 100;
  x.clearRect(0, 0, w, h);
  paintBg(x, w, h);
  x.save();
  x.translate(w / 2 + L.ox / 100 * w, h / 2 + L.oy / 100 * h);
  if (L.rt) x.rotate(L.rt * Math.PI / 180);
  x.globalAlpha = L.op / 100;
  if (L.shb || L.shd) { x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = L.shb / 100 * w * 0.1; x.shadowOffsetX = 0; x.shadowOffsetY = L.shd / 100 * w * 0.1; }
  x.imageSmoothingQuality = 'high';
  x.drawImage(tintSrc(src), -w * k / 2, -h * k / 2, w * k, h * k);
  x.restore(); drawText(x, w, h);
}
function prevSrc() {
  if (S.prev && S.prevFor === S.src) return S.prev;
  var k = Math.min(1, 720 / Math.max(S.W, S.H)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(S.W * k)); c.height = Math.max(1, Math.round(S.H * k));
  var cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(S.src, 0, 0, c.width, c.height);
  S.prev = c; S.prevFor = S.src; return c;
}
var raf = 0;
function redraw() {
  if (raf) return;
  raf = requestAnimationFrame(function () {
    raf = 0; if (!S.src) return;
    drawLayers(cv.getContext('2d'), cv.width, cv.height, prevSrc());
  });
}
var SWATCH = ['', '#ffffff', '#000000', '#CD853F', '#B27539', '#15161a', '#f01424', '#2563eb'];
var SLIDERS = {
  logo: [['sc', 'Size', 10, 200, '%', 0], ['oy', 'Up/Down', -50, 50, '', 1], ['ox', 'Left/Right', -50, 50, '', 0], ['op', 'Opacity', 5, 100, '%', 0], ['rt', 'Turn', -180, 180, '', 0]],
  shadow: [['shb', 'Blur', 0, 100, '', 0], ['shd', 'Distance', 0, 100, '', 0]]
};
var layBtns = {};
function swatchRow(a, key) {
  var sw = document.createElement('div'); sw.className = 'lc-sw';
  SWATCH.forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button';
    b.style.background = c || 'repeating-conic-gradient(#555 0% 25%,#2b2c33 0% 50%) 50%/10px 10px';
    if (S.L[key] === c) b.className = 'on';
    b.onclick = function () { S.L[key] = c; buildAdj(); redraw(); };
    sw.appendChild(b);
  });
  var ci = document.createElement('input'); ci.type = 'color'; ci.value = /^#[0-9a-f]{6}$/i.test(S.L[key]) ? S.L[key] : '#cd853f';
  ci.oninput = function () { S.L[key] = ci.value; redraw(); };
  sw.appendChild(ci); a.appendChild(sw);
}
function sliderRows(a, list) {
  list.forEach(function (d) {
    var row = document.createElement('div'); row.className = 'lc-sl';
    var n = document.createElement('span'); n.className = 'n'; n.textContent = d[1];
    var r = document.createElement('input'); r.type = 'range'; r.min = d[2]; r.max = d[3]; r.step = 1;
    var v = document.createElement('span'); v.className = 'v';
    var mi = document.createElement('button'), pl = document.createElement('button');
    mi.type = 'button'; pl.type = 'button'; mi.textContent = '-'; pl.textContent = '+';
    function get() { return d[5] ? -S.L[d[0]] : S.L[d[0]]; }
    function set(val) { val = clamp(Math.round(val), d[2], d[3]); S.L[d[0]] = d[5] ? -val : val; r.value = val; v.textContent = val + d[4]; redraw(); }
    r.value = get(); v.textContent = get() + d[4];
    r.oninput = function () { set(parseFloat(r.value)); };
    mi.onclick = function () { set(get() - 1); };
    pl.onclick = function () { set(get() + 1); };
    row.appendChild(n); row.appendChild(mi); row.appendChild(r); row.appendChild(pl); row.appendChild(v); a.appendChild(row);
  });
}
function textRows(a) {
  var row = document.createElement('div'); row.className = 'lc-sl';
  var t = document.createElement('input'); t.type = 'text'; t.placeholder = 'Type text'; t.value = S.L.tx; t.maxLength = 40;
  t.style.cssText = 'flex:1;min-width:0;height:30px;background:#0f1014;color:#fff;border:1px solid #303139;border-radius:8px;padding:0 10px;font-size:16px;font-family:inherit';
  t.oninput = function () { S.L.tx = t.value; redraw(); };
  row.appendChild(t); a.appendChild(row);
}
function fontRows(a) {
  var fr = document.createElement('div'); fr.className = 'lc-sw';
  FONTS.forEach(function (f, i) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = f[0];
    b.style.cssText = 'width:auto;height:30px;border-radius:10px;padding:0 10px;font-size:12px'; b.style.fontFamily = f[1];
    if (S.L.tf === i) b.className = 'on';
    b.onclick = function () { S.L.tf = i; buildAdj(); redraw(); };
    fr.appendChild(b);
  });
  [['B', 'tbold'], ['I', 'tital']].forEach(function (z) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = z[0];
    b.style.cssText = 'width:34px;height:30px;border-radius:10px;padding:0;font-size:13px;font-weight:900';
    if (S.L[z[1]]) b.className = 'on';
    b.onclick = function () { S.L[z[1]] = S.L[z[1]] ? 0 : 1; buildAdj(); redraw(); };
    fr.appendChild(b);
  });
  a.appendChild(fr);
}
function buildAdj() {
  var a = $('lcAdj'), s = S.lay; a.innerHTML = ''; a.style.maxHeight = '136px'; a.style.overflowY = 'auto';
  Object.keys(layBtns).forEach(function (k) { layBtns[k].className = s === k ? 'on' : ''; });
  if (s === 'bg') swatchRow(a, 'bg');
  else if (s === 'bg2') { swatchRow(a, 'bg2'); sliderRows(a, [['ang', 'Angle', 0, 360, '\u00b0', 0]]); }
  else if (s === 'logo') sliderRows(a, [['sc', 'Size', 10, 200, '%', 0], ['oy', 'Up/Down', -50, 50, '', 1], ['ox', 'Left/Right', -50, 50, '', 0], ['op', 'Opacity', 5, 100, '%', 0], ['rt', 'Turn', -180, 180, '', 0]]);
  else if (s === 'tint') { swatchRow(a, 'tint'); sliderRows(a, [['tn', 'Amount', 0, 100, '%', 0]]); }
  else if (s === 'shadow') sliderRows(a, [['shb', 'Blur', 0, 100, '', 0], ['shd', 'Distance', 0, 100, '', 0]]);
  else if (s === 'text') { textRows(a); sliderRows(a, [['tsz', 'Size', 2, 100, '%', 0], ['toy', 'Up/Down', -50, 50, '', 1], ['tox', 'Left/Right', -50, 50, '', 0]]); }
  else if (s === 'tstyle') { fontRows(a); swatchRow(a, 'tc'); sliderRows(a, [['top', 'Opacity', 5, 100, '%', 0]]); }
}
function buildAdjOld() {
  var a = $('lcAdj'); a.innerHTML = ''; a.style.maxHeight = '104px'; a.style.overflowY = 'auto';
  Object.keys(layBtns).forEach(function (k) { layBtns[k].className = S.lay === k ? 'on' : ''; });
  if (S.lay === 'bg') {
    var sw = document.createElement('div'); sw.className = 'lc-sw';
    SWATCH.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      b.style.background = c || 'repeating-conic-gradient(#555 0% 25%,#2b2c33 0% 50%) 50%/10px 10px';
      if (S.L.bg === c) b.className = 'on';
      b.onclick = function () { S.L.bg = c; buildAdj(); redraw(); };
      sw.appendChild(b);
    });
    var ci = document.createElement('input'); ci.type = 'color'; ci.value = /^#[0-9a-f]{6}$/i.test(S.L.bg) ? S.L.bg : '#cd853f';
    ci.oninput = function () { S.L.bg = ci.value; redraw(); };
    sw.appendChild(ci); a.appendChild(sw); return;
  }
  SLIDERS[S.lay].forEach(function (d) {
    var row = document.createElement('div'); row.className = 'lc-sl';
    var n = document.createElement('span'); n.className = 'n'; n.textContent = d[1];
    var r = document.createElement('input'); r.type = 'range'; r.min = d[2]; r.max = d[3]; r.step = 1;
    var v = document.createElement('span'); v.className = 'v';
    var mi = document.createElement('button'), pl = document.createElement('button');
    mi.type = 'button'; pl.type = 'button'; mi.textContent = '-'; pl.textContent = '+';
    function get() { return d[5] ? -S.L[d[0]] : S.L[d[0]]; }
    function set(val) { val = clamp(Math.round(val), d[2], d[3]); S.L[d[0]] = d[5] ? -val : val; r.value = val; v.textContent = val + d[4]; redraw(); }
    r.value = get(); v.textContent = get() + d[4];
    r.oninput = function () { set(parseFloat(r.value)); };
    mi.onclick = function () { set(get() - 1); };
    pl.onclick = function () { set(get() + 1); };
    row.appendChild(n); row.appendChild(mi); row.appendChild(r); row.appendChild(pl); row.appendChild(v); a.appendChild(row);
  });
}
[['bg', 'Color 1'], ['bg2', 'Color 2'], ['logo', 'Logo'], ['tint', 'Tint'], ['shadow', 'Shadow'], ['text', 'Text'], ['tstyle', 'Font']].forEach(function (l) {
  var b = document.createElement('button'); b.type = 'button'; b.textContent = l[1];
  b.onclick = function () { S.lay = l[0]; buildAdj(); };
  $('lcLayer').appendChild(b); layBtns[l[0]] = b;
});
buildAdj();

/* ----- touch / mouse ----- */
    function onDown(e) {
      if (!S.src || S.busy) return;
      var r = imgEl.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, s = S.scale, R = S.rect;
      var bx = R.x * s, by = R.y * s, bw = R.w * s, bh = R.h * s;
      var hd = hitTest(bx, by, bw, bh, mx, my, !S.ratio); if (!hd) return;
      var offX = 0, offY = 0;
      if (hd !== 'move') {
        if (hd.indexOf('l') > -1) offX = mx - bx; else if (hd.indexOf('r') > -1) offX = mx - (bx + bw);
        if (hd.indexOf('t') > -1) offY = my - by; else if (hd.indexOf('b') > -1) offY = my - (by + bh);
      }
      S.drag = { hd: hd, sx: e.clientX, sy: e.clientY, start: { x: R.x, y: R.y, w: R.w, h: R.h }, offX: offX, offY: offY };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    }
    function onMove(e) {
      var d = S.drag; if (!d) return;
      var r = imgEl.getBoundingClientRect(), s = S.scale, min = Math.max(8, 36 / s);
      min = Math.min(min, S.W, S.H);
      if (d.hd === 'move') S.rect = moveRect(d.start, (e.clientX - d.sx) / s, (e.clientY - d.sy) / s, S.W, S.H);
      else S.rect = sizeRect(d.hd, d.start, (e.clientX - r.left - d.offX) / s, (e.clientY - r.top - d.offY) / s, S.W, S.H, S.ratio, min);
      paint(); e.preventDefault();
    }
    function onUp() { S.drag = null; }
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);

    /* ----- saving ----- */
    function exportBlob(cb) {
      var R = S.rect, sx = clamp(Math.round(R.x), 0, S.W - 1), sy = clamp(Math.round(R.y), 0, S.H - 1);
      var w = clamp(Math.round(R.w), 1, S.W - sx), h = clamp(Math.round(R.h), 1, S.H - sy);
      var o = outSize(w, h, S.size), c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
      var x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      if (S.round) { x.beginPath(); x.ellipse(o.w / 2, o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); x.clip(); }
      var full = document.createElement('canvas'); full.width = S.W; full.height = S.H; drawLayers(full.getContext('2d'), S.W, S.H, S.src); x.drawImage(full, sx, sy, w, h, 0, 0, o.w, o.h);
      var t = outType();
      c.toBlob(function (b) { cb(b); }, t, 0.92);
    }
    function b64(blob) {
      return new Promise(function (res, rej) {
        var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1] || ''); }; r.onerror = rej; r.readAsDataURL(blob);
      });
    }
    function newPath(ext) {
      var p = f.path, i = p.lastIndexOf('/'), dir = i < 0 ? '' : p.slice(0, i + 1), nm = p.slice(i + 1).replace(/\.[^.]+$/, '');
      var fl = (typeof files !== 'undefined' && files) ? files : [], cand = dir + nm + '-crop.' + ext, n = 2;
      while (fl.some(function (x) { return x.path === cand; })) { cand = dir + nm + '-crop-' + n + '.' + ext; n++; }
      return cand;
    }
    function close() { window.removeEventListener('resize', layout); if (ro) ro.disconnect(); root.remove(); }
    function save(replace) {
      if (S.busy) return;
      if (S.src === S.orig && layersDefault() && !S.round && !S.size && Math.round(S.rect.x) === 0 && Math.round(S.rect.y) === 0 && Math.round(S.rect.w) >= S.W && Math.round(S.rect.h) >= S.H) { close(); toast('No changes made', 'success'); return; }
      S.busy = true; paint();
      exportBlob(async function (blob) {
        try {
          if (!blob) throw new Error('Could not make the image');
          var path = f.path, kind = 'edit', note = 'Cropped logo';
          if (replace) {
            f.blob = blob; f.size = blob.size; f.type = blob.type; f.text = null;
            try { urlCache.delete(f.path); } catch (x) {}
            if (f.uri && window.FolderAccess && FolderAccess.available) {
              try { await FolderAccess.saveFile({ uri: f.uri, binary: true }, await b64(blob)); }
              catch (x) { toast('Saved in the project, but not to the phone file', 'error'); }
            }
          } else {
            path = newPath(typeExt(blob.type || outType())); kind = 'new'; note = 'Cropped copy of ' + f.path;
            files.push({ path: path, name: path.split('/').pop(), size: blob.size, type: blob.type || 'image/png', blob: blob, text: null });
            files.sort(function (a, b) { return a.path.localeCompare(b.path); });
          }
          close();
          try { if (typeof render === 'function') render(); } catch (x) {}
          try { if (typeof window.saveCurrentProject === 'function') await window.saveCurrentProject(); } catch (x) {}
          try { if (typeof window.logHistory === 'function') window.logHistory({ type: kind, path: path, note: note }); } catch (x) {}
          toast((replace ? 'Replaced ' : 'Saved ') + path, 'success');
        } catch (err) {
          S.busy = false; paint();
          toast('Could not save: ' + ((err && err.message) || err), 'error');
        }
      });
    }
    copy.onclick = function () { save(true); };
    rep.onclick = function () { save(true); };
    $('lcX').onclick = close;
    if (f.text != null && typeof openCode === 'function') {
      var cb = $('lcCode'); cb.hidden = false;
      cb.onclick = function () { close(); openCode(); };
    }

    /* ----- load the picture ----- */
    var ro = null;
    var blob0;
    try {
      blob0 = isSvg ? new Blob([svgSized(f.text != null ? f.text : '')], { type: 'image/svg+xml;charset=utf-8' })
        : (typeof fileBlob === 'function' ? fileBlob(f) : f.blob);
    } catch (x) {}
    var url = '', img = new Image();
    img.onload = function () {
      try { URL.revokeObjectURL(url); } catch (x) {}
      var c = document.createElement('canvas'); c.width = img.naturalWidth || 1024; c.height = img.naturalHeight || 1024;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      S.orig = c; S.src = c; S.W = c.width; S.H = c.height; S.rect = { x: 0, y: 0, w: S.W, h: S.H };
      mark(); layout();
      window.addEventListener('resize', layout); var ld = $('lcLoad'); if (ld) ld.remove();
      if (window.ResizeObserver) { ro = new ResizeObserver(layout); ro.observe(stage); }
    };
    img.onerror = function () {
      try { URL.revokeObjectURL(url); } catch (x) {}
      close(); toast('Could not open this image', 'error');
    };
    if (!blob0) { close(); toast('Could not open this image', 'error'); return; }
    url = URL.createObjectURL(blob0); img.src = url;
  };
})();
