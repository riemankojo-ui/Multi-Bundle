/* Multi Bundle - Edit profile (tap your profile -> Edit profile -> Save) */
(function () {
  if (window.__profileEditLoaded) return;
  window.__profileEditLoaded = true;

  var RED = '#f01424';

  function user() { try { return firebase.auth().currentUser; } catch (e) { return null; } }
  function photoKey(u) { return 'mb_photo_' + u.uid; }
  function getPhoto(u) { try { return localStorage.getItem(photoKey(u)) || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t); }

  function css() {
    if (document.getElementById('pePageCss')) return;
    var s = document.createElement('style'); s.id = 'pePageCss';
    s.textContent = [
      '#peSheet{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;opacity:0;transition:opacity .18s ease}',
      '#peSheet.on{opacity:1}',
      '#peSheet .pe-box{width:100%;background:#16171c;border-radius:20px 20px 0 0;padding:10px 16px calc(16px + env(safe-area-inset-bottom,0px));transform:translateY(30px);transition:transform .2s ease}',
      '#peSheet.on .pe-box{transform:none}',
      '#peSheet .pe-grab{width:38px;height:4px;border-radius:4px;background:#34353d;margin:0 auto 12px}',
      '#peSheet button{display:block;width:100%;border:0;border-radius:12px;padding:15px;font-size:15px;font-weight:800;font-family:inherit;cursor:pointer;margin-top:8px}',
      '#peSheet .pe-edit{background:#fff;color:#0d0e12}',
      '#peSheet .pe-cancel{background:#22232a;color:#cfd0d8}',
      '#peSheet button:active{transform:scale(.98)}',
      '#pePage{position:fixed;inset:0;z-index:10060;background:#0d0e12;color:#fff;display:flex;flex-direction:column;height:100dvh;transform:translateY(100%);transition:transform .25s ease;font-family:inherit}',
      '#pePage.on{transform:none}',
      '#pePage .pe-top{display:flex;align-items:center;gap:12px;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 10px}',
      '#pePage .pe-back{background:none;border:0;color:#fff;font-size:26px;line-height:1;padding:4px 8px 4px 0;cursor:pointer}',
      '#pePage .pe-title{font-size:18px;font-weight:800}',
      '#pePage .pe-body{flex:1;overflow:auto;padding:18px 22px}',
      '#pePage .pe-av{position:relative;width:104px;height:104px;border-radius:50%;margin:8px auto 10px;background:#2f3a52;display:grid;place-items:center;font-size:42px;font-weight:800;color:#cfe0ff;overflow:hidden}',
      '#pePage .pe-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '#pePage .pe-photo-actions{display:flex;justify-content:center;gap:22px;margin-bottom:30px}',
      '#pePage .pe-link{background:none;border:0;color:' + RED + ';font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;padding:6px}',
      '#pePage .pe-link.mute{color:#8b8c96}',
      '#pePage label{display:block;font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#8b8c96;margin:0 0 6px}',
      '#pePage .pe-field{width:100%;box-sizing:border-box;background:none;border:0;border-bottom:1.5px solid #2c2d35;color:#fff;font-size:18px;padding:8px 0 10px;outline:0;font-family:inherit;border-radius:0}',
      '#pePage .pe-field:focus{border-bottom-color:' + RED + '}',
      '#pePage .pe-field[readonly]{color:#8b8c96}',
      '#pePage .pe-group{margin-bottom:26px}',
      '#pePage .pe-hint{font-size:12px;color:#6f707a;margin-top:6px}',
      '#pePage .pe-foot{padding:12px 22px calc(16px + env(safe-area-inset-bottom,0px))}',
      '#pePage .pe-save{width:100%;border:0;border-radius:14px;background:' + RED + ';color:#fff;font-size:16px;font-weight:800;padding:16px;font-family:inherit;cursor:pointer}',
      '#pePage .pe-save:active{transform:scale(.98)}',
      '#pePage .pe-save:disabled{opacity:.55}',
      '#peLoad{position:fixed;inset:0;z-index:10070;background:#0d0e12;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#cfd0d8;font-weight:700}',
      '#peLoad.on{display:flex}',
      '#peLoad .pe-spin{width:42px;height:42px;border-radius:50%;border:4px solid #2a2b31;border-top-color:' + RED + ';animation:peSpin .8s linear infinite}',
      '@keyframes peSpin{to{transform:rotate(360deg)}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function closeSheet() {
    var s = document.getElementById('peSheet'); if (!s) return;
    s.classList.remove('on'); setTimeout(function () { s.remove(); }, 200);
  }

  function openSheet() {
    css(); closeSheet();
    var s = document.createElement('div'); s.id = 'peSheet';
    s.innerHTML = '<div class="pe-box"><div class="pe-grab"></div><button class="pe-edit">Edit profile</button><button class="pe-cancel">Cancel</button></div>';
    document.body.appendChild(s);
    requestAnimationFrame(function () { s.classList.add('on'); });
    s.addEventListener('click', function (e) { if (e.target === s) closeSheet(); });
    s.querySelector('.pe-cancel').onclick = closeSheet;
    s.querySelector('.pe-edit').onclick = function () { closeSheet(); setTimeout(openPage, 120); };
  }

  function avatarInner(name, photo) {
    return '<span>' + esc((name || '?').charAt(0).toUpperCase()) + '</span>' + (photo ? '<img src="' + esc(photo) + '" alt="" referrerpolicy="no-referrer">' : '');
  }

  function openPage() {
    var u = user(); if (!u) { toast('Sign in first', 'error'); return; }
    css();
    var old = document.getElementById('pePage'); if (old) old.remove();
    var name = u.displayName || '';
    var email = u.email || (u.providerData && u.providerData[0] && u.providerData[0].email) || '';
    var photo = getPhoto(u) || u.photoURL || '';
    var newPhoto = null; // null = unchanged, '' = removed, string = new

    var p = document.createElement('div'); p.id = 'pePage';
    p.innerHTML =
      '<div class="pe-top"><button class="pe-back" aria-label="Back">\u2039</button><div class="pe-title">Edit profile</div></div>' +
      '<div class="pe-body">' +
        '<div class="pe-av" id="peAv"></div>' +
        '<div class="pe-photo-actions"><button class="pe-link" id="peChange">Change photo</button><button class="pe-link mute" id="peRemove">Remove</button></div>' +
        '<div class="pe-group"><label for="peName">Name</label><input class="pe-field" id="peName" maxlength="40" autocomplete="name" placeholder="Your name"></div>' +
        '<div class="pe-group"><label>Email</label><input class="pe-field" id="peEmail" readonly><div class="pe-hint">Email can\u2019t be changed here.</div></div>' +
        '<input type="file" id="peFile" accept="image/*" style="display:none">' +
      '</div>' +
      '<div class="pe-foot"><button class="pe-save" id="peSave">Save</button></div>';
    document.body.appendChild(p);
    var av = p.querySelector('#peAv'), nameIn = p.querySelector('#peName');
    nameIn.value = name; p.querySelector('#peEmail').value = email;
    function paint() { av.innerHTML = avatarInner(nameIn.value || email.split('@')[0], newPhoto === null ? photo : newPhoto); }
    paint();
    nameIn.addEventListener('input', function () { if (newPhoto === null ? !photo : !newPhoto) paint(); });
    requestAnimationFrame(function () { p.classList.add('on'); });

    function close() { p.classList.remove('on'); setTimeout(function () { p.remove(); }, 260); }
    p.querySelector('.pe-back').onclick = close;
    p.querySelector('#peChange').onclick = function () { p.querySelector('#peFile').click(); };
    p.querySelector('#peRemove').onclick = function () { newPhoto = ''; paint(); };

    p.querySelector('#peFile').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var img = new Image();
        img.onload = function () {
          var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
          var m = Math.min(img.width, img.height), sx = (img.width - m) / 2, sy = (img.height - m) / 2;
          c.getContext('2d').drawImage(img, sx, sy, m, m, 0, 0, S, S);
          newPhoto = c.toDataURL('image/jpeg', 0.82); paint();
        };
        img.onerror = function () { toast('Could not read that image', 'error'); };
        img.src = r.result;
      };
      r.readAsDataURL(f); e.target.value = '';
    };

    p.querySelector('#peSave').onclick = async function () {
      var btn = this, nm = nameIn.value.trim();
      if (!nm) { toast('Enter your name', 'error'); nameIn.focus(); return; }
      btn.disabled = true;
      var ld = document.getElementById('peLoad');
      if (!ld) { ld = document.createElement('div'); ld.id = 'peLoad'; ld.innerHTML = '<div class="pe-spin"></div><div>Saving profile\u2026</div>'; document.body.appendChild(ld); }
      ld.classList.add('on');
      var started = Date.now(), ok = true;
      try {
        var cu = user();
        if (cu && nm !== (cu.displayName || '')) await cu.updateProfile({ displayName: nm });
        if (cu && newPhoto !== null) {
          try { if (newPhoto) localStorage.setItem(photoKey(cu), newPhoto); else localStorage.removeItem(photoKey(cu)); } catch (e) { ok = false; }
        }
        if (typeof window.__refreshProfile === 'function') window.__refreshProfile();
      } catch (e) { ok = false; console.warn(e); }
      var wait = Math.max(0, 1100 - (Date.now() - started));
      setTimeout(function () {
        ld.classList.remove('on');
        p.remove();
        if (typeof window.showTab === 'function') window.showTab('home');
        toast(ok ? 'Profile saved' : 'Saved with a problem, try again', ok ? 'success' : 'error');
      }, wait);
    };
  }

  window.openEditProfile = openPage;

  // Tap the profile (home card or menu) -> sheet. Sign out button keeps its own action.
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('button')) return;
    if (t.closest('#authBox .acc-row') || t.closest('#drawerAccount .drawer-acc')) openSheet();
  }, true);
})();
