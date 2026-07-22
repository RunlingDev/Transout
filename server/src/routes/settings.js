// 系统设置（仅管理员）
const express = require('express');
const { db, getSetting } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

const KEYS = ['frpc_path', 'ngrok_path'];

router.get('/', (req, res) => {
  const out = {};
  for (const k of KEYS) out[k] = getSetting(k);
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const k of KEYS) {
    if (body[k] !== undefined) up.run(k, String(body[k]));
  }
  const out = {};
  for (const k of KEYS) out[k] = getSetting(k);
  res.json(out);
});

module.exports = router;
