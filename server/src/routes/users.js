// 用户管理（仅管理员）
const express = require('express');
const { db } = require('../db');
const { hashPassword } = require('../auth');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

const LIST_SQL = `
  SELECT u.id, u.username, u.is_admin, u.group_id, g.name AS group_name, u.created_at
  FROM users u LEFT JOIN groups g ON g.id = u.group_id ORDER BY u.id`;

router.get('/', (req, res) => {
  const rows = db.prepare(LIST_SQL).all();
  res.json(rows.map((r) => ({ ...r, is_admin: !!r.is_admin })));
});

router.post('/', (req, res) => {
  const { username, password, is_admin, group_id } = req.body || {};
  if (!username || typeof username !== 'string') return res.status(400).json({ error: '用户名不能为空' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });
  const gid = group_id == null ? 1 : Number(group_id);
  if (!db.prepare('SELECT id FROM groups WHERE id = ?').get(gid)) {
    return res.status(400).json({ error: '指定的用户组不存在' });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin, group_id) VALUES (?, ?, ?, ?)')
    .run(username.trim(), hashPassword(String(password)), is_admin ? 1 : 0, gid);
  const row = db.prepare(`${LIST_SQL.replace('ORDER BY u.id', '')} WHERE u.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ...row, is_admin: !!row.is_admin });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const { password, is_admin, group_id } = req.body || {};

  if (is_admin !== undefined && !is_admin && target.id === req.user.id) {
    return res.status(400).json({ error: '不能将自己降为非管理员' });
  }
  if (password !== undefined) {
    if (String(password).length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), id);
  }
  if (is_admin !== undefined) {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id);
  }
  if (group_id !== undefined) {
    const gid = Number(group_id);
    if (!db.prepare('SELECT id FROM groups WHERE id = ?').get(gid)) {
      return res.status(400).json({ error: '指定的用户组不存在' });
    }
    db.prepare('UPDATE users SET group_id = ? WHERE id = ?').run(gid, id);
  }
  const row = db.prepare(`${LIST_SQL.replace('ORDER BY u.id', '')} WHERE u.id = ?`).get(id);
  res.json({ ...row, is_admin: !!row.is_admin });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
