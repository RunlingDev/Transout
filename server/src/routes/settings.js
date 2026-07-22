// 系统设置（仅管理员）
const express = require('express');
const { execFile } = require('child_process');
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

// 检测二进制可用性：POST /settings/check { which: 'frpc' | 'ngrok' }
// 优先用请求体里（未保存的）路径，便于保存前测试
router.post('/check', (req, res) => {
  const which = req.body && req.body.which;
  if (!['frpc', 'ngrok'].includes(which)) return res.status(400).json({ error: "which 必须是 frpc 或 ngrok" });
  const key = `${which}_path`;
  const bin = (req.body.path && String(req.body.path).trim()) || getSetting(key) || which;
  const args = which === 'frpc' ? ['-v'] : ['version'];
  execFile(bin, args, { timeout: 5000 }, (err, stdout, stderr) => {
    if (err) {
      const msg = err.code === 'ENOENT'
        ? `未找到 ${which} 二进制（${bin}）`
        : (String(stderr).trim() || err.message).slice(0, 500);
      return res.json({ ok: false, error: msg });
    }
    const out = (String(stdout) + String(stderr)).trim();
    res.json({ ok: true, version: out.split('\n')[0] || '未知版本' });
  });
});

module.exports = router;
