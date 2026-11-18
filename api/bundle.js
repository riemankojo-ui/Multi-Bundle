const { requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const uid = await requireAuth(req, res);
  if (!uid) return;

  const { name, files } = req.body || {};
  if (!name || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Send name and files: [{ path, content }]' });
  }

  const line = '='.repeat(60);
  let out = 'Multi Bundle Export\n';
  out += 'Project: ' + name + '\n';
  out += 'Files: ' + files.length + '\n';
  out += 'Exported: ' + new Date().toISOString() + '\n';
  out += line + '\n\n';

  for (const f of files) {
    out += '\n' + line + '\nFILE: ' + f.path + '\n' + line + '\n\n';
    out += (f.content || '') + '\n';
  }

  res.status(200).json({ ok: true, files: files.length, bundle: out });
};