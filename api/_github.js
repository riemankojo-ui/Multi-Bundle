const admin = require('firebase-admin');

// Reads the GitHub token you saved by connecting GitHub in Multi Bundle
async function getGithubToken(uid) {
  const doc = await admin.firestore().doc('users/' + uid + '/private/github').get();
  return doc.exists ? (doc.data().token || '') : '';
}

// Signed-in owner: always allowed.
// API key: needs the permission switched on AND the repo in its allowed list.
async function checkAccess(req, perm, repo) {
  const key = req.headers['x-api-key'];
  if (!key) return { ok: true };
  const doc = await admin.firestore().collection('apiKeys').doc(String(key)).get();
  const d = doc.exists ? doc.data() : {};
  const perms = d.permissions || {};
  if (!perms[perm]) return { ok: false, error: 'This key is not allowed to use ' + perm };
  const repos = Array.isArray(d.repos) ? d.repos : [];
  const allowed = repos.map(r => String(r).toLowerCase());
  if (!allowed.includes(String(repo).toLowerCase())) {
    return { ok: false, error: 'This key is not allowed to use the repo ' + repo };
  }
  return { ok: true };
}

async function gh(token, path, opts) {
  const r = await fetch('https://api.github.com' + path, Object.assign({}, opts, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'multi-bundle-api',
      'Content-Type': 'application/json',
    }, (opts && opts.headers) || {}),
  }));
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

function validRepo(repo) {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(repo || ''));
}

module.exports = { getGithubToken, checkAccess, gh, validRepo };