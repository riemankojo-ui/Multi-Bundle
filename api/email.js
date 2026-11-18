const admin = require('firebase-admin');
const { requireAuth } = require('./_auth');

const DAILY_LIMIT = 20;

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

  const { to, subject, html, text } = req.body || {};
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Send to, subject and html (or text)' });
  }
  const list = (Array.isArray(to) ? to : [to]).map(s => String(s).trim());
  if (list.length > 5 || !list.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    return res.status(400).json({ error: 'to must be 1 to 5 valid email addresses' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return res.status(500).json({ error: 'Email is not set up on the server' });
  }

  const day = new Date().toISOString().slice(0, 10);
  const db = admin.firestore();
  const ref = db.collection('emailUsage').doc(uid + '_' + day);
  const used = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const n = snap.exists ? snap.data().count : 0;
    if (n + list.length > DAILY_LIMIT) return -1;
    t.set(ref, { uid, day, count: n + list.length });
    return n + list.length;
  });
  if (used < 0) {
    return res.status(429).json({ error: 'Daily limit reached (' + DAILY_LIMIT + ' emails). Try again tomorrow.' });
  }

  const r = await fetch('https://api