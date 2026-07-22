// 用户组管理（仅管理员）
const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireAdmin);

const DEFAULT_GROUP_ID = 1;
const MODES = ['none', 'whitelist', 'blacklist'];

function groupView(g) {
  let list = [];
  try {
    list = JSON.parse(g.source_policy_list || '[]');
  } catch (e) { /* 按空列表 */ }
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM user_groups WHERE group_id = ?').get(g.id).n;
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    source_policy_mode: g.source_policy_mode,
    source_policy_list: Array.isArray(list) ? list : [],
    member_count: memberCount,
  };
}

// 校验并规范化策略字段，返回 {error} 或 {mode, listJson}
function validatePolicy(body) {
  const mode = body.source_policy_mode === undefined ? 'none' : body.source_policy_mode;
  if (!MODES.includes(mode)) return { error: 'source_policy_mode 必须是 none/whitelist/blacklist' };
  const list = body.source_policy_list === undefined ? [] : body.source_policy_list;
  if (!Array.isArray(list) || list.some((e) => typeof e !== 'string')) {
    return { error: 'source_policy_list 必须是字符串数组' };
  }
  return { mode, listJson: JSON.stringify(list) };
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM groups ORDER BY id').all().map(groupView));
});

router.post('/', (req, res) => {
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: '组名不能为空' });
  const p = validatePolicy(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error });
  if (db.prepare('SELECT id FROM groups WHERE name = ?').get(name.trim())) {
    return res.status(409).json({ error: '组名已存在' });
  }
  const info = db.prepare('INSERT INTO groups (name, description, source_policy_mode, source_policy_list) VALUES (?, ?, ?, ?)')
    .run(name.trim(), description || '', p.mode, p.listJson);
  res.status(201).json(groupView(db.prepare('SELECT * FROM groups WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  if (!g) return res.status(404).json({ error: '用户组不存在' });
  const { name, description } = req.body || {};

  if (name !== undefined && name !== g.name) {
    if (id === DEFAULT_GROUP_ID) return res.status(400).json({ error: '默认组不可改名' });
    if (!name || typeof name !== 'string') return res.status(400).json({ error: '组名不能为空' });
    if (db.prepare('SELECT id FROM groups WHERE name = ? AND id != ?').get(name.trim(), id)) {
      return res.status(409).json({ error: '组名已存在' });
    }
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(name.trim(), id);
  }
  if (description !== undefined) {
    db.prepare('UPDATE groups SET description = ? WHERE id = ?').run(String(description), id);
  }
  if (req.body.source_policy_mode !== undefined || req.body.source_policy_list !== undefined) {
    const p = validatePolicy({
      source_policy_mode: req.body.source_policy_mode === undefined ? g.source_policy_mode : req.body.source_policy_mode,
      source_policy_list: req.body.source_policy_list === undefined ? JSON.parse(g.source_policy_list || '[]') : req.body.source_policy_list,
    });
    if (p.error) return res.status(400).json({ error: p.error });
    db.prepare('UPDATE groups SET source_policy_mode = ?, source_policy_list = ? WHERE id = ?').run(p.mode, p.listJson, id);
  }
  res.json(groupView(db.prepare('SELECT * FROM groups WHERE id = ?').get(id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === DEFAULT_GROUP_ID) return res.status(400).json({ error: '默认组不可删除' });
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  if (!g) return res.status(404).json({ error: '用户组不存在' });
  // 清理成员关系：不再属于任何组的用户回落到默认组
  db.prepare('DELETE FROM user_groups WHERE group_id = ?').run(id);
  db.prepare(`
    INSERT OR IGNORE INTO user_groups (user_id, group_id)
    SELECT id, ? FROM users WHERE id NOT IN (SELECT user_id FROM user_groups)`).run(DEFAULT_GROUP_ID);
  // users.group_id（主组展示）同步修正
  db.prepare(`
    UPDATE users SET group_id = COALESCE(
      (SELECT MIN(group_id) FROM user_groups WHERE user_id = users.id), ?)
    WHERE group_id NOT IN (SELECT id FROM groups WHERE id != ?) OR group_id = ?`)
    .run(DEFAULT_GROUP_ID, id, id);
  // 清理渠道授权记录
  db.prepare("DELETE FROM channel_access WHERE subject_type = 'group' AND subject_id = ?").run(id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
