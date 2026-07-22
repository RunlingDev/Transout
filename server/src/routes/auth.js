// 认证路由：初始化、登录、当前用户、改密、改邮箱
const express = require('express');
const { db, setUserGroups } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');
const { requireAuth } = require('../middleware');

const router = express.Router();

function userView(u) {
  const groups = db.prepare(`
    SELECT g.id, g.name FROM user_groups ug JOIN groups g ON g.id = ug.group_id
    WHERE ug.user_id = ? ORDER BY g.id`).all(u.id);
  return {
    id: u.id,
    username: u.username,
    email: u.email || '',
    is_admin: !!u.is_admin,
    group_id: u.group_id,
    group_name: groups.length ? groups[0].name : null,
    groups,
  };
}

function userCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// 是否需要初始化（无用户时前端引导创建管理员）
router.get('/bootstrap', (req, res) => {
  res.json({ needs_setup: userCount() === 0 });
});

// 初始化：仅当用户表为空时创建首个管理员
router.post('/bootstrap', (req, res) => {
  if (userCount() > 0) return res.status(409).json({ error: '系统已初始化，无法重复创建' });
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string') return res.status(400).json({ error: '用户名不能为空' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });
  const info = db.prepare('INSERT INTO users (username, password_hash, is_admin, group_id) VALUES (?, ?, 1, 1)')
    .run(username.trim(), hashPassword(String(password)));
  setUserGroups(info.lastInsertRowid, [1]);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: signToken(user), user: userView(user) });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  res.json({ token: signToken(user), user: userView(user) });
});

// 当前用户
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: userView(req.user) });
});

// 修改自己的密码
router.put('/password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: '旧密码和新密码不能为空' });
  if (String(new_password).length < 6) return res.status(400).json({ error: '新密码长度至少 6 位' });
  if (!verifyPassword(String(old_password), req.user.password_hash)) {
    return res.status(400).json({ error: '旧密码不正确' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(new_password)), req.user.id);
  res.json({ ok: true });
});

// 修改自己的邮箱（空串表示清除）
router.put('/email', requireAuth, (req, res) => {
  const { email } = req.body || {};
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }
  }
  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.user.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: userView(u) });
});

module.exports = router;
