/* cloudfix.js - checks and repairs cloud sync of project files.
   Adds a small "Cloud sync check" card under the account card on Home.
   1. Check cloud     -> compares file counts: this phone vs the cloud, per project.
   2. Upload all      -> forgets what was uploaded before and uploads every file again.
                         Use it on the phone that has ALL the files.
   3. Download missing-> asks the cloud again and adds any files this phone lacks. */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function mount() {
    if ($('cfCard')) return true;
    var anchor = $('authCard');
    if (!anchor || !anchor.parentNode) return false;
    var card = document.createElement('section');
    card.className = 'card';
    card.id = 'cfCard';
    card.innerHTML =
      '<label class="eyebrow">CLOUD SYNC</label><h2>Cloud sync check</h2>' +
      '<p style="margin:6px 0 10px;color:#8f919b;font-size:13px;line-height:1.5">Use this if projects on another phone show only a few files.</p>' +
      '<div class="actions" style="flex-wrap:wrap">' +
      '<button class="btn secondary" id="cfCheck" type="button">Check cloud</button>' +
      '<button class="btn secondary" id="cfUp" type="button">Upload all</button>' +
      '<button class="btn secondary" id="cfDown" type="button">Download missing</button>' +
      '</div>' +
      '<div id="cfOut" style="margin-top:12px;font-size:13px;line-height:1.7;color:#cfd0d8;white-space:pre-wrap"></div>';
    anchor.parentNode.insertBefore(card, anchor.nextSibling);
    $('cfCheck').onclick = check;
    $('cfUp').onclick = upload;
    $('cfDown').onclick = download;
    return true;
  }

  function out(html) { var o = $('cfOut'); if (o) o.innerHTML = html; }
  function busy(b) { ['cfCheck', 'cfUp', 'cfDown'].forEach(function (id) { var e = $(id); if (e) { e.disabled = b; e.style.opacity = b ? '.6' : '1'; } }); }
  function user() { try { return firebase.auth().currentUser; } catch (e) { return null; } }

  async function counts() {
    var local = await dbGetAll();
    var cloud = await window.cloudProj.load();
    if (!window.__cloudLoadOK) throw new Error('The cloud did not answer. Try again.');
    var map = {};
    local.forEach(function (p) { map[p.id] = { name: p.name || 'Untitled', phone: (p.files || []).length, cloud: null }; });
    cloud.forEach(function (p) {
      if (p.deleted) return;
      var m = map[p.id] = map[p.id] || { name: p.name || 'Untitled', phone: null, cloud: null };
      m.cloud = (p.files || []).length;
    });
    return { local: local, cloud: cloud, map: map };
  }

  async function check() {
    if (!user()) { out('Sign in first.'); return; }
    busy(true); out('Checking the cloud…');
    try {
      var r = await counts(), lines = [], bad = 0;
      Object.keys(r.map).forEach(function (id) {
        var m = r.map[id], ok = m.phone === m.cloud;
        if (!ok) bad++;
        lines.push((ok ? '✓ ' : '✗ ') + esc(m.name) + ' — this phone: ' + (m.phone == null ? 'none' : m.phone) + ' · cloud: ' + (m.cloud == null ? 'none' : m.cloud));
      });
      out(lines.join('<br>') + '<br><br>' + (bad ? 'Rule of thumb: if the cloud number is lower, press Upload all on the phone that has everything. If this phone is lower, press Download missing.' : 'Everything matches.'));
    } catch (e) { out('Check failed: ' + esc(e && e.message || e)); }
    busy(false);
  }

  async function upload() {
    var u = user(); if (!u) { out('Sign in first.'); return; }
    busy(true); out('Reading the cloud…');
    try {
      var r = await counts(), risky = [];
      Object.keys(r.map).forEach(function (id) {
        var m = r.map[id];
        if (m.phone != null && m.cloud != null && m.cloud > m.phone) risky.push(m.name + ' (phone ' + m.phone + ', cloud ' + m.cloud + ')');
      });
      if (risky.length && !confirm('The cloud has MORE files than this phone for:\n' + risky.join('\n') + '\n\nUploading from this phone could make the cloud smaller. Continue?')) { out('Cancelled.'); busy(false); return; }
      out('Uploading every file again… this can take a while. Keep the app open.');
      try { localStorage.removeItem('mb_cloudsig_' + u.uid); } catch (e) {}
      window.__sigUid = null;                       // makes the uploader forget what it already sent
      await window.cloudProj.save(r.local);
      out('Upload finished. Press Check cloud to confirm.');
    } catch (e) { out('Upload failed: ' + esc(e && e.message || e)); }
    busy(false);
  }

  async function download() {
    var u = user(); if (!u) { out('Sign in first.'); return; }
    busy(true); out('Asking the cloud for missing files…');
    try {
      try { localStorage.removeItem('mb_restored_' + u.uid); } catch (e) {}
      window.__cloudRestoreDone = false;
      var changed = await window.__restoreFromCloud();
      if (typeof window.__refreshProjects === 'function') await window.__refreshProjects();
      out(changed ? 'Added missing files from the cloud. Press Check cloud to confirm.' : 'Nothing was missing, or the cloud has no more files than this phone.');
    } catch (e) { out('Download failed: ' + esc(e && e.message || e)); }
    busy(false);
  }

  if (!mount()) document.addEventListener('DOMContentLoaded', mount);
})();
