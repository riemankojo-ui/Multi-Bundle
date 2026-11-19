const { requireAuth } = require('./_auth');
const { getGithubToken, checkAccess, gh, validRepo } = require('./_github');

const MAX_FILES = 20;
const MAX_FILE_CHARS = 1000000;

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

  const { repo, files, message, branch } = req.body || {};
  if (!validRepo(repo)) {
    return res.status(400).json({ error: 'Send repo as owner/name, for example myname/my-repo' });
  }
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
    return res.status(400).json({ error: 'Send files: [{ path, content }], 1 to ' + MAX_FILES + ' files' });
  }
  for (const f of files) {
    const p = f && f.path;
    if (typeof p !== 'string' || !p || p.startsWith('/') || p.includes('..') || p.length > 200) {
      return res.status(400).json({ error: 'Bad file path: ' + String(p).slice(0, 60) });
    }
    if (typeof f.content !== 'string' || f.content.length > MAX_FILE_CHARS) {
      return res.status(400).json({ error: 'Each file needs text content under 1,000,000 characters: ' + p });
    }
  }

  const access = await checkAccess(req, 'publish', repo);
  if (!access.ok) return res.status(403).json({ error: access.error });
  if (files.some(f => f.path.startsWith('.git