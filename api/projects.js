const admin = require('firebase-admin');
const { requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-api-secret');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    await handle(req, res);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

async function handle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const uid = await requireAuth(req, res);
  if (!uid) return;

  const col = admin.firestore().collection('users/' + uid + '/projects');
  const id = req.body && req.body.id;

  if (!id) {
    const snap = await col.get();
    const projects = snap.docs.map(d => {
      const m = d.data();
      return { id: m.id, name: m.name || '', files: (m.paths || []).length, savedAt: m.savedAt || 0, source: m.source || '' };
    }).sort((a, b) => b.savedAt - a.savedAt).slice(0, 50);
    return res.status(200).json({ ok: true, count: projects.length, projects });
  }

  const ref = col.doc(encodeURIComponent(String(id)));
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
  const m = doc.data();
  const fsnap = await ref.collection('files').get();
  const files = fsnap.docs.map(d => d.data()).filter(f => typeof f.text === 'string').sort((a, b) => String(a.path).localeCompare(String(b.path)));

  const line = '='.repeat(60);
  let out = 'Multi Bundle Export\n';
  out += 'Project: ' + (m.name || id) + '\n';
  out += 'Files: ' + files.length + '\n';
  out += 'Exported: ' + new Date().toISOString() + '\n';
  out += line + '\n\n';
  for (const f of files) {
    out += '\n' + line + '\nFILE: ' + f.path + '\n' + line + '\n\n' + f.text + '\n';
  }
  if (out.length > 4000000) {
    return res.status(413).json({ error: 'This project is too large to export through the API' });
  }
  return res.status(200).json({ ok: true, name: m.name || '', files: files.length, bundle: out });
}