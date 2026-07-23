// 渠道管理
const express = require('express');
const { execFile } = require('child_process');
const { db, getSetting } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');
const { canUseChannel } = require('../services/channelAccess');
const cloudSg = require('../services/cloudSg');
const runner = require('../services/runner');

const router = express.Router();

const SECRET_KEYS = ['token', 'authtoken'];
const MASK = '********';

// 脱敏：有值返回 ********，空返回 ''；cloud.accessKeySecret 同样脱敏，其余 cloud 字段明文回显
function maskConfig(config) {
  const c = { ...config };
  for (const k of SECRET_KEYS) {
    if (k in c) c[k] = c[k] ? MASK : '';
  }
  if (c.cloud && typeof c.cloud === 'object') {
    const cloud = { ...c.cloud };
    cloud.accessKeySecret = cloud.accessKeySecret ? MASK : '';
    c.cloud = cloud;
  }
  return c;
}

function channelView(ch, withAccess) {
  const view = {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    config: maskConfig(JSON.parse(ch.config || '{}')),
    enabled: !!ch.enabled,
    created_at: ch.created_at,
  };
  if (withAccess) {
    view.access = db.prepare('SELECT subject_type, subject_id FROM channel_access WHERE channel_id = ?').all(ch.id);
  }
  return view;
}

// 校验云安全组绑定（frp 渠道可选 config.cloud），返回错误消息或 null
function validateCloud(cloud) {
  if (cloud === undefined || cloud === null) return null;
  if (typeof cloud !== 'object' || Array.isArray(cloud)) return 'config.cloud 必须是对象';
  if (!['aliyun', 'tencent'].includes(cloud.provider)) return 'config.cloud.provider 必须是 aliyun 或 tencent';
  for (const k of ['regionId', 'securityGroupId', 'accessKeyId', 'accessKeySecret']) {
    if (!cloud[k] || typeof cloud[k] !== 'string') return `config.cloud.${k} 不能为空`;
  }
  return null;
}

// 校验 type 与 config，返回错误消息或 null
function validateChannel(body) {
  const { name, type, config } = body;
  if (!name || typeof name !== 'string') return '渠道名称不能为空';
  if (!['frp', 'ngrok'].includes(type)) return 'type 必须是 frp 或 ngrok';
  if (!config || typeof config !== 'object' || Array.isArray(config)) return 'config 必须是对象';
  if (type === 'frp') {
    if (!config.serverAddr) return 'frp 渠道需要 config.serverAddr';
    const port = Number(config.serverPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 'frp 渠道需要有效的 config.serverPort';
  } else if (!config.authtoken) {
    return 'ngrok 渠道需要 config.authtoken';
  }
  return validateCloud(config.cloud);
}

// 写入授权列表（先清空再插入）
function replaceAccess(channelId, access) {
  db.prepare('DELETE FROM channel_access WHERE channel_id = ?').run(channelId);
  const ins = db.prepare('INSERT OR IGNORE INTO channel_access (channel_id, subject_type, subject_id) VALUES (?, ?, ?)');
  for (const a of access) ins.run(channelId, a.subject_type, a.subject_id);
}

// 校验授权列表元素合法性
function validateAccess(access) {
  if (!Array.isArray(access)) return 'access 必须是数组';
  for (const a of access) {
    if (!a || !['group', 'user'].includes(a.subject_type)) return 'access 元素的 subject_type 必须是 group 或 user';
    const sid = Number(a.subject_id);
    if (!Number.isInteger(sid)) return 'access 元素的 subject_id 无效';
    const table = a.subject_type === 'group' ? 'groups' : 'users';
    if (!db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(sid)) {
      return `access 引用的${a.subject_type === 'group' ? '用户组' : '用户'} ${sid} 不存在`;
    }
    a.subject_id = sid;
  }
  return null;
}

// 列表：管理员全部（含 access），普通用户仅有权限的
router.get('/', requireAuth, (req, res) => {
  const all = db.prepare('SELECT * FROM channels ORDER BY id').all();
  if (req.user.is_admin) return res.json(all.map((c) => channelView(c, true)));
  res.json(all.filter((c) => canUseChannel(req.user, c.id)).map((c) => channelView(c, false)));
});

router.post('/', requireAdmin, (req, res) => {
  const body = req.body || {};
  const err = validateChannel(body);
  if (err) return res.status(400).json({ error: err });
  const access = body.access === undefined ? [] : body.access;
  const aerr = validateAccess(access);
  if (aerr) return res.status(400).json({ error: aerr });

  const info = db.prepare('INSERT INTO channels (name, type, config, enabled, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(body.name.trim(), body.type, JSON.stringify(body.config), body.enabled === false ? 0 : 1, req.user.id);
  replaceAccess(info.lastInsertRowid, access);
  res.status(201).json(channelView(db.prepare('SELECT * FROM channels WHERE id = ?').get(info.lastInsertRowid), true));
});

router.put('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  if (!ch) return res.status(404).json({ error: '渠道不存在' });
  const body = req.body || {};

  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string') return res.status(400).json({ error: '渠道名称不能为空' });
    db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(body.name.trim(), id);
  }
  if (body.enabled !== undefined) {
    db.prepare('UPDATE channels SET enabled = ? WHERE id = ?').run(body.enabled ? 1 : 0, id);
  }
  if (body.config !== undefined) {
    const merged = { ...body.config };
    const old = JSON.parse(ch.config || '{}');
    // 掩码值表示未修改，保留原值
    for (const k of SECRET_KEYS) {
      if (merged[k] === MASK) merged[k] = old[k] || '';
    }
    // cloud.accessKeySecret 同理：掩码或缺省表示保留原值
    if (merged.cloud && typeof merged.cloud === 'object') {
      const oldSecret = (old.cloud && old.cloud.accessKeySecret) || '';
      if (merged.cloud.accessKeySecret === MASK || merged.cloud.accessKeySecret === undefined) {
        merged.cloud = { ...merged.cloud, accessKeySecret: oldSecret };
      }
    }
    const err = validateChannel({ name: 'x', type: ch.type, config: merged });
    if (err) return res.status(400).json({ error: err });
    db.prepare('UPDATE channels SET config = ? WHERE id = ?').run(JSON.stringify(merged), id);
  }
  if (body.access !== undefined) {
    const aerr = validateAccess(body.access);
    if (aerr) return res.status(400).json({ error: aerr });
    replaceAccess(id, body.access);
  }
  res.json(channelView(db.prepare('SELECT * FROM channels WHERE id = ?').get(id), true));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  if (!ch) return res.status(404).json({ error: '渠道不存在' });
  runner.stopChannelTunnels(id); // 先停运行中的隧道
  db.prepare('DELETE FROM tunnels WHERE channel_id = ?').run(id);
  db.prepare('DELETE FROM channel_access WHERE channel_id = ?').run(id);
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 测试云安全组连接（凭据有效性 + 安全组可达性）。
// 编辑已保存渠道时 accessKeySecret 传掩码或留空，取用该渠道已保存的密钥
router.post('/check-cloud', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const cloud = { ...(body.cloud || {}) };
  if ((cloud.accessKeySecret === MASK || !cloud.accessKeySecret) && body.channel_id) {
    const ch = db.prepare('SELECT config FROM channels WHERE id = ?').get(Number(body.channel_id));
    if (ch) {
      try {
        const old = JSON.parse(ch.config || '{}');
        cloud.accessKeySecret = (old.cloud && old.cloud.accessKeySecret) || '';
      } catch { /* 配置损坏按空密钥处理，由 testConnection 报错 */ }
    }
  }
  try {
    const message = await cloudSg.testConnection(cloud);
    res.json({ ok: true, message });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// 检测二进制可用性：frp 用 `frpc -v`，ngrok 用 `ngrok version`
router.post('/:id/check', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  if (!ch) return res.status(404).json({ error: '渠道不存在' });
  const binName = ch.type === 'frp' ? 'frpc' : 'ngrok';
  const bin = getSetting(ch.type === 'frp' ? 'frpc_path' : 'ngrok_path') || binName;
  const args = ch.type === 'frp' ? ['-v'] : ['version'];
  execFile(bin, args, { timeout: 5000 }, (err, stdout, stderr) => {
    if (err) {
      const msg = err.code === 'ENOENT'
        ? `未找到 ${binName} 二进制（${bin}），请在设置中配置路径`
        : (String(stderr).trim() || err.message).slice(0, 500);
      return res.json({ ok: false, error: msg });
    }
    const out = (String(stdout) + String(stderr)).trim();
    res.json({ ok: true, version: out.split('\n')[0] || '未知版本' });
  });
});

module.exports = router;
