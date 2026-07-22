// 渠道访问控制：无记录=全员可用，有记录=仅授权组/用户，管理员不受限
const { db } = require('../db');

function canUseChannel(user, channelId) {
  if (user.is_admin) return true;
  const rows = db.prepare('SELECT subject_type, subject_id FROM channel_access WHERE channel_id = ?').all(channelId);
  if (rows.length === 0) return true;
  return rows.some((r) =>
    (r.subject_type === 'user' && r.subject_id === user.id) ||
    (r.subject_type === 'group' && r.subject_id === user.group_id)
  );
}

module.exports = { canUseChannel };
