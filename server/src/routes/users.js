// 用户管理（仅管理员）
const express = require('express');
const { db, setUserGroups } = require('../db');
const { hashPassword } = require('../auth');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

const LIST_SQL = `
  SELECT u.id, u.username, u.email, u.is_admin, u.group_id, u.source_policy_combine, g.name AS group_name, u.created_at
  FROM users u LEFT JOIN groups g ON g.id = u.group_id`;

function userRow(id) {
  const row = db.prepare(`${LIST_SQL} WHERE u.id = ?`).get(id);
  const groups = db.prepare(`
    SELECT g.id, g.name FROM user_groups ug JOIN groups g ON g.id = ug.group_id
    WHERE ug.user_id = ? ORDER BY g.id`).all(id);
  return { ...row, is_admin: !!row.is_admin, email: row.email || '', groups };
}

// 校验邮箱格式（允许空），返回错误消息或 null
function validateEmail(email) {
  if (email === undefined || email === null || email === '') return null;
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return '邮箱格式不正确';
  }
  return null;
}

// 校验 group_ids 数组，返回错误消息或 null
function validateGroupIds(groupIds) {
  if (!Array.isArray(groupIds)) return 'group_ids 必须是数组';
  for (const gid of groupIds) {
    if (!db.prepare('SELECT id FROM groups WHERE id = ?').get(Number(gid))) {
      return `用户组 ${gid} 不存在`;
    }
  }
  return null;
}

// 多组冲突时的合并策略（单用户级）
const COMBINE_MODES = ['union', 'intersection'];

router.get('/', (req, res) => {
  const rows = db.prepare(`${LIST_SQL} ORDER BY u.id`).all();
  const gs = db.prepare(`
    SELECT ug.user_id, g.id, g.name FROM user_groups ug JOIN groups g ON g.id = ug.group_id ORDER BY g.id`).all();
  const byUser = {};
  for (const g of gs) (byUser[g.user_id] = byUser[g.user_id] || []).push({ id: g.id, name: g.name });
  res.json(rows.map((r) => ({
    ...r,
    is_admin: !!r.is_admin,
    email: r.email || '',
    groups: byUser[r.id] || [],
  })));
});

router.post('/', (req, res) => {
  const { username, password, is_admin, email } = req.body || {};
  if (!username || typeof username !== 'string') return res.status(400).json({ error: '用户名不能为空' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });
  const eerr = validateEmail(email);
  if (eerr) return res.status(400).json({ error: eerr });
  const combine = req.body.source_policy_combine === undefined ? 'union' : req.body.source_policy_combine;
  if (!COMBINE_MODES.includes(combine)) {
    return res.status(400).json({ error: 'source_policy_combine 必须是 union 或 intersection' });
  }
  const groupIds = req.body.group_ids === undefined ? [1] : req.body.group_ids;
  const gerr = validateGroupIds(groupIds);
  if (gerr) return res.status(400).json({ error: gerr });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim())) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin, email, source_policy_combine) VALUES (?, ?, ?, ?, ?)')
    .run(username.trim(), hashPassword(String(password)), is_admin ? 1 : 0, email || null, combine);
  setUserGroups(info.lastInsertRowid, groupIds.length ? groupIds : [1]);
  res.status(201).json(userRow(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const { password, is_admin, email } = req.body || {};

  if (is_admin !== undefined && !is_admin && target.id === req.user.id) {
    return res.status(400).json({ error: '不能将自己降为非管理员' });
  }
  if (password !== undefined && password !== '') {
    if (String(password).length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(password)), id);
  }
  if (is_admin !== undefined) {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id);
  }
  if (email !== undefined) {
    const eerr = validateEmail(email);
    if (eerr) return res.status(400).json({ error: eerr });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, id);
  }
  if (req.body.source_policy_combine !== undefined) {
    if (!COMBINE_MODES.includes(req.body.source_policy_combine)) {
      return res.status(400).json({ error: 'source_policy_combine 必须是 union 或 intersection' });
    }
    db.prepare('UPDATE users SET source_policy_combine = ? WHERE id = ?').run(req.body.source_policy_combine, id);
  }
  if (req.body.group_ids !== undefined) {
    const gerr = validateGroupIds(req.body.group_ids);
    if (gerr) return res.status(400).json({ error: gerr });
    setUserGroups(id, req.body.group_ids.length ? req.body.group_ids : [1]);
  }
  res.json(userRow(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM user_groups WHERE user_id = ?').run(id);
  db.prepare("DELETE FROM channel_access WHERE subject_type = 'user' AND subject_id = ?").run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
