// 认证路由：初始化、登录、当前用户、改密
const express = require('express');
const { db } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../auth');
const { requireAuth } = require('../middleware');

const router = express.Router();

function userView(u) {
  const g = db.prepare('SELECT name FROM groups WHERE id = ?').get(u.group_id);
  return {
    id: u.id,
    username: u.username,
    is_admin: !!u.is_admin,
    group_id: u.group_id,
    group_name: g ? g.name : null,
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

module.exports = router;
