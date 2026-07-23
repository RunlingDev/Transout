// 隧道管理
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware');
const { canUseChannel } = require('../services/channelAccess');
const { checkSourceAllowed } = require('../services/sourcePolicy');
const { tcpCheck, publicCheck } = require('../services/tunnelTest');
const { parseFrpcConfig, findFrpChannel } = require('../services/frpcImport');
const cloudSg = require('../services/cloudSg');
const runner = require('../services/runner');

const router = express.Router();
router.use(requireAuth);

// 云安全组联动：渠道（frp）绑定了 config.cloud 且隧道为 tcp 且有 remote_port 时返回 cloud 配置，否则返回 null
function cloudBinding(channel, tunnel) {
  if (!channel || channel.type !== 'frp') return null;
  if (tunnel.proto !== 'tcp' || !tunnel.remote_port) return null;
  let config;
  try {
    config = JSON.parse(channel.config || '{}');
  } catch {
    return null;
  }
  const cloud = config.cloud;
  if (!cloud || !cloud.provider) return null;
  return cloud;
}

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

  // 源站策略（聚合用户全部所属组）
  const check = checkSourceAllowed(req.user, source_host, sp);
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
    remote_port: num(body.remote_port),
    subdomain: str(body.subdomain),
    domain: str(body.domain),
  };
}

// 插入一条隧道，返回 lastInsertRowid（POST / 与导入接口共用）
function insertTunnel(channelId, ownerId, f) {
  const info = db.prepare(`
    INSERT INTO tunnels (name, channel_id, owner_id, proto, source_host, source_port,
      remote_port, subdomain, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(f.name, channelId, ownerId, f.proto, f.source_host, f.source_port,
      f.remote_port, f.subdomain, f.domain);
  return info.lastInsertRowid;
}

router.get('/', (req, res) => {
  const rows = req.user.is_admin
    ? db.prepare(`${VIEW_SQL} ORDER BY t.id`).all()
    : db.prepare(`${VIEW_SQL} WHERE t.owner_id = ? ORDER BY t.id`).all(req.user.id);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(body.channel_id));
  const err = validateTunnel(req, body, channel);
  if (err) return res.status(err.status).json({ error: err.error });

  const f = pickFields(body);
  const id = insertTunnel(channel.id, req.user.id, f);
  const view = getView(id);
  // 云安全组放行失败不阻断创建，仅以 cloud_warning 告知
  const cloud = cloudBinding(channel, f);
  if (cloud) {
    try {
      await cloudSg.authorizeRule(cloud, f.remote_port);
    } catch (e) {
      view.cloud_warning = `云安全组放行失败：${e.message}`;
    }
  }
  res.status(201).json(view);
});

// 从 frpc 配置（ini/toml）导入隧道：解析 → 按 serverAddr + server_port + token 匹配 frp 渠道 → 逐条创建
router.post('/import', (req, res) => {
  const content = req.body ? req.body.content : null;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: '请提供配置内容 content' });
  }

  let parsed;
  try {
    parsed = parseFrpcConfig(content);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { channel, hint } = findFrpChannel(db, parsed);
  const results = [];
  for (const entry of parsed.tunnels) {
    const fail = (error) => results.push({ name: entry.name, success: false, error });
    if (entry.error) { fail(entry.error); continue; }
    if (!entry.name) { fail('缺少隧道名称'); continue; }
    if (!channel) { fail(hint); continue; }
    const dup = db.prepare('SELECT id FROM tunnels WHERE name = ? AND owner_id = ?')
      .get(entry.name, req.user.id);
    if (dup) { fail('同名隧道已存在'); continue; }
    const err = validateTunnel(req, entry, channel);
    if (err) { fail(err.error); continue; }
    const id = insertTunnel(channel.id, req.user.id, pickFields(entry));
    results.push({ name: entry.name, success: true, tunnel_id: Number(id) });
  }

  res.json({
    matched_channel: channel ? { id: channel.id, name: channel.name } : null,
    results,
  });
});

router.put('/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能修改自己的隧道' });
  // 仅运行/启动中禁止修改；异常（error）态进程已退出，允许修改后重新启动
  if (t.status === 'running' || t.status === 'starting') {
    return res.status(400).json({ error: '隧道运行中，请先停止再修改' });
  }

  const body = { ...t, ...(req.body || {}) };
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(Number(body.channel_id));
  const err = validateTunnel(req, body, channel);
  if (err) return res.status(err.status).json({ error: err.error });

  const f = pickFields(body);
  db.prepare(`
    UPDATE tunnels SET name = ?, channel_id = ?, proto = ?, source_host = ?, source_port = ?,
      remote_port = ?, subdomain = ?, domain = ?
    WHERE id = ?`)
    .run(f.name, channel.id, f.proto, f.source_host, f.source_port,
      f.remote_port, f.subdomain, f.domain, t.id);
  res.json(getView(t.id));
});

router.delete('/:id', async (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能删除自己的隧道' });
  if (t.enabled || t.status === 'running' || t.status === 'starting') runner.stopTunnel(t);
  db.prepare('DELETE FROM tunnels WHERE id = ?').run(t.id);
  // 云安全组规则移除：同渠道其他隧道仍占用该 remote_port 时跳过；失败仅记录日志
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id);
  const cloud = cloudBinding(channel, t);
  if (cloud) {
    const inUse = db
      .prepare('SELECT COUNT(*) AS n FROM tunnels WHERE channel_id = ? AND proto = ? AND remote_port = ?')
      .get(t.channel_id, 'tcp', t.remote_port).n > 0;
    if (!inUse) {
      try {
        await cloudSg.revokeRule(cloud, t.remote_port);
      } catch (e) {
        console.error(`隧道 ${t.id} 删除后移除云安全组规则失败：${e.message}`);
      }
    }
  }
  res.json({ ok: true });
});

router.post('/:id/start', async (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });

  // 启动前再次校验渠道权限与源站策略
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id);
  if (!channel) return res.status(400).json({ error: '隧道所属渠道不存在' });
  if (!channel.enabled) return res.status(400).json({ error: '该渠道已禁用' });
  if (!canUseChannel(req.user, channel.id)) return res.status(403).json({ error: '没有该渠道的使用权限' });
  const check = checkSourceAllowed(req.user, t.source_host, t.source_port);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  runner.startTunnel(t);
  const view = getView(t.id);
  // 确保云安全组已放行（幂等）；失败不阻断启动，仅以 cloud_warning 告知
  const cloud = cloudBinding(channel, t);
  if (cloud) {
    try {
      await cloudSg.authorizeRule(cloud, t.remote_port);
    } catch (e) {
      view.cloud_warning = `云安全组放行失败：${e.message}`;
    }
  }
  res.json(view);
});

router.post('/:id/stop', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });
  runner.stopTunnel(t);
  res.json(getView(t.id));
});

// 隧道详情（所有者或管理员）
router.get('/:id', (req, res) => {
  const t = getView(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能查看自己的隧道' });
  res.json(t);
});

// 隧道日志末尾（所有者或管理员）
router.get('/:id/log', (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能查看自己的隧道' });
  res.json({ log: runner.tailLog(runner.logFile(t.id), 8192) });
});

// 源站连通性测试（TCP 探测 + 时延）
router.post('/:id/test/source', async (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });
  res.json(await tcpCheck(t.source_host, t.source_port));
});

// 穿透后公网端测试（含时延）
router.post('/:id/test/public', async (req, res) => {
  const t = db.prepare('SELECT * FROM tunnels WHERE id = ?').get(Number(req.params.id));
  if (!t) return res.status(404).json({ error: '隧道不存在' });
  if (!canManage(req.user, t)) return res.status(403).json({ error: '只能操作自己的隧道' });
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id);
  if (!channel) return res.status(400).json({ error: '隧道所属渠道不存在' });
  res.json(await publicCheck(t, channel));
});

module.exports = router;
