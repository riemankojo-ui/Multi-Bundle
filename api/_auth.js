const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

// Returns the user's uid, or sends an error and returns null
async function requireUser(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Missing sign-in token' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

const crypto = require('crypto');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Accepts API key + secret headers, or a Firebase sign-in token
async function requireAuth(req, res) {
  const key = req.headers['x-api-key'];
  const secret = req.headers['x-api-secret'];
  if (key || secret) {
    if (!key || !secret || !String(key).startsWith('wkml_')) {
      res.status(401).json({ error: 'Invalid API key or secret' });
      return null;
    }
    const ref = admin.firestore().collection('apiKeys').doc(String(key));
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(401).json({ error: 'Invalid API key or secret' });
      return null;
    }
    const a = Buffer.from(doc.data().secretHash);
    const b = Buffer.from(sha(String(secret)));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Invalid API key or secret' });
      return null;
    }
    ref.update({ lastUsed: Date.now() }).catch(() => {});
    return doc.data().uid;
  }
  return requireUser(req, res);
}

module.exports = { requireUser, requireAuth, sha };