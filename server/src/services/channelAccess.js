// 渠道访问控制：无授权记录=仅管理员可用（默认拒绝），有记录=授权组（含用户任一所属组）/用户可用
const { db, getUserGroupIds } = require('../db');

function canUseChannel(user, channelId) {
  if (user.is_admin) return true;
  const rows = db.prepare('SELECT subject_type, subject_id FROM channel_access WHERE channel_id = ?').all(channelId);
  if (rows.length === 0) return false;
  const gids = new Set(getUserGroupIds(user.id));
  return rows.some((r) =>
    (r.subject_type === 'user' && r.subject_id === user.id) ||
    (r.subject_type === 'group' && gids.has(r.subject_id))
  );
}

module.exports = { canUseChannel };
