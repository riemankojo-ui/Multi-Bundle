const crypto = require('crypto');
const admin = require('firebase-admin');
const { requireUser, sha } = require('./_auth');

module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};

async function handle(req, res) {
  const uid = await requireUser(req, res);
  if (!uid) return;
  const col = admin.firestore().collection('apiKeys');

  if (req.method === 'GET') {
    const snap = await col.where('uid', '==', uid).get();
    const keys = snap.docs.map(d => ({
      key: d.id,
      name: d.data().name,
      createdAt: d.data().createdAt,
      lastUsed: d.data().lastUsed || null,
    }));
    return res.status(200).json({ keys });
  }

  if (req.method === 'POST') {
    const existing = await col.where('uid', '==', uid).get();
    if (existing.size >= 5) {
      return res.status(400).json({ error: 'Limit is 5 keys. Delete one first.' });
    }
    const name = String((req.body && req.body.name) || 'My key').slice(0, 40);
    const key = 'wkml_' + crypto.randomBytes(12).toString('hex');
    const secret = 'mlsecret_' + crypto.randomBytes(24).toString('hex');
    await col.doc(key).set({
      uid,
      name,
      secretHash: sha(secret),
      createdAt: Date.now(),
    });
    return res.status(200).json({ key, secret, name });
  }

  if (req.method === 'DELETE') {
    const key = req.body && req.body.key;
    const ref = col.doc(String(key || ''));
    const doc = await ref.get();
    if (!doc.exists || doc.data().uid !== uid) {
      return res.status(404).json({ error: 'Key not found' });
    }
    await ref.delete();
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Use GET, POST or DELETE' });
}