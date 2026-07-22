// 认证/鉴权中间件
const { verifyToken } = require('./auth');
const { db } = require('./db');

// 校验 Bearer token，加载用户到 req.user
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ error: '未登录或登录已过期' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: '用户不存在或已被删除' });
  req.user = user;
  next();
}

// 要求管理员
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: '需要管理员权限' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
