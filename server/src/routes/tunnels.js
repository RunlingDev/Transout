// 隧道管理
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware');
const { canUseChannel } = require('../services/channelAccess');
const { checkSourceAllowed } = require('../services/sourcePolicy');
const runner = require('../services/runner');

const router = express.Router();
router.use(requireAuth);

const VIEW_SQL = `
  SELECT t.*, c.name AS channel_name, c.type AS channel_type, u.username AS owner_name
  FROM tunnels t
  LEFT JOIN channels c ON c.id = t.channel_id
  LEFT JOIN users u ON u.id = t.owner_id`;

function getView(id) {
  return db.prepare(`${VIEW_SQL} WHERE t.id = ?`).get(id);
}

// 是否所有者或管理员
function canManage(user, tunnel) {
  return user.is_admin || tunnel.owner_id === user.id;
}

// 创建/更新前的业务校验，返回 {status, error} 或 null
function validateTunnel(req, body, channel) {
  if (!channel) return { status: 400, error: '指定的渠道不存在' };
  if (!channel.enabled) return { status: 400, error: '该渠道已禁用' };
  if (!canUseChannel(req.user, channel.id)) return { status: 403, error: '没有该渠道的使用权限' };

  const { name, proto, source_host } = body;
  if (!name || typeof name !== 'string') return { status: 400, error: '隧道名称不能为空' };
  if (!['tcp', 'http', 'https'].includes(proto)) return { status: 400, error: 'proto 必须是 tcp/http/https' };
  if (!source_host || typeof source_host !== 'string') return { status: 400, error: '源站地址 source_host 不能为空' };
  const sp = Number(body.source_port);
  if (!Number.isInteger(sp) || sp < 1 || sp > 65535) return { status: 400, error: '源站端口 source_port 无效' };

  if (channel.type === 'frp') {
    if (proto === 'tcp') {
      const rp = Number(body.remote_port);
      if (!Number.isInteger(rp) || rp < 1 || rp > 65535) return { status: 400, error: 'frp TCP 隧道需要有效的 remote_port' };
    } else if (!body.subdomain && !body.domain) {
      return { status: 400, error: 'frp HTTP/HTTPS 隧道需要 subdomain 或 domain' };
    }
  }

  // 源站策略（按当前用户所在组）
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.user.group_id);
  const check = checkSourceAllowed(group, source_host, sp);
  if (!check.allowed) return { status: 403, error: check.reason };
  return null;
}

function pickFields(body) {
  const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  return {
    name: String(body.name).trim(),
    proto: body.proto,
    source_host: String(body.source_host).trim(),
    source_port: Number(body.source_port),
    target_host: str(body.target_host),
    target_port: num(body.target_port),
    remote_port: num(body.remote_port),
    subdomain: str(body.subdomain),
    domain: str(body.domain),
  };
}

router.get('/', (req, res) => {
  const rows = req.user.is_admin
    ? db.prepare(`${VIEW_SQL} ORDER BY t.id`).all()
    : db.prepare(`${VIEW_SQL} WHERE t.owner_id = ? ORDER BY t.id`).all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(body.channel_id));
  const err = validateTunnel(req, body, channel);
  if (err) return res.status(err.status).json({ error: err.error });

  const f = pickFields(body);
  const info = db.prepare(`
    INSERT INTO tunnels (name, channel_id, owner_id, proto, source_host, source_port,
      target_host, target_port, remote_port, subdomain, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(f.name, channel.id, req.user.id, f.proto, f.source_host, f.source_port,
      f.target_host, f.target_port, f.remote_port, f.subdomain, f.domain);
  res.status(201).json(getView(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能修改自己的隧道' });
  if (t.enabled || t.status === 'running' || t.status === 'starting') {
    return res.status(400).json({ error: '隧道运行中，请先停止再修改' });
  }

  const body = { ...t, ...(req.body || {}) };
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(body.channel_id));
  const err = validateTunnel(req, body, channel);
  if (err) return res.status(err.status).json({ error: err.error });

  const f = pickFields(body);
  db.prepare(`
    UPDATE tunnels SET name = ?, channel_id = ?, proto = ?, source_host = ?, source_port = ?,
      target_host = ?, target_port = ?, remote_port = ?, subdomain = ?, domain = ?
    WHERE id = ?`)
    .run(f.name, channel.id, f.proto, f.source_host, f.source_port,
      f.target_host, f.target_port, f.remote_port, f.subdomain, f.domain, t.id);
  res.json(getView(t.id));
});

router.delete('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能删除自己的隧道' });
  if (t.enabled || t.status === 'running' || t.status === 'starting') runner.stopTunnel(t);
  db.prepare('DELETE FROM tunnels WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

router.post('/:id/start', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });

  // 启动前再次校验渠道权限与源站策略
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id);
  if (!channel) return res.status(400).json({ error: '隧道所属渠道不存在' });
  if (!channel.enabled) return res.status(400).json({ error: '该渠道已禁用' });
  if (!canUseChannel(req.user, channel.id)) return res.status(403).json({ error: '没有该渠道的使用权限' });
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.user.group_id);
  const check = checkSourceAllowed(group, t.source_host, t.source_port);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  runner.startTunnel(t);
  res.json(getView(t.id));
});

router.post('/:id/stop', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });
  runner.stopTunnel(t);
  res.json(getView(t.id));
});

module.exports = router;
