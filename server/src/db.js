// SQLite 数据库初始化：建表 + 内置数据
const Database = require('better-sqlite3');
const path = require('path');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'transout.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  group_id INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_policy_mode TEXT NOT NULL DEFAULT 'none',
  source_policy_list TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('frp','ngrok')),
  config TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('group','user')),
  subject_id INTEGER NOT NULL,
  UNIQUE(channel_id, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS tunnels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  proto TEXT NOT NULL CHECK(proto IN ('tcp','http','https')),
  source_host TEXT NOT NULL,
  source_port INTEGER NOT NULL,
  target_host TEXT,
  target_port INTEGER,
  remote_port INTEGER,
  subdomain TEXT,
  domain TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'stopped',
  pid INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);
`);

// 轻量迁移：为已有库补充新增列（SQLite 不支持 IF NOT EXISTS 加列，捕获重复列错误）
function addColumn(table, ddl) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  } catch (e) {
    if (!/duplicate column name/i.test(e.message)) throw e;
  }
}
addColumn('users', 'email TEXT');
addColumn('tunnels', 'public_url TEXT');

// 迁移：把 users.group_id 的既有归属写入 user_groups（多组成员表）
db.prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) SELECT id, group_id FROM users').run();

// 内置默认组（id=1）
db.prepare("INSERT OR IGNORE INTO groups (id, name, description) VALUES (1, '默认组', '系统内置默认组')").run();

// 内置默认设置
const setDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
setDefault.run('frpc_path', 'frpc');
setDefault.run('ngrok_path', 'ngrok');

// 读取设置项
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

// 用户所属全部组 id（多组成员；无记录时回退 users.group_id）
function getUserGroupIds(userId) {
  const rows = db.prepare('SELECT group_id FROM user_groups WHERE user_id = ?').all(userId);
  if (rows.length) return rows.map((r) => r.group_id);
  const u = db.prepare('SELECT group_id FROM users WHERE id = ?').get(userId);
  return u ? [u.group_id] : [];
}

// 覆盖用户的组成员关系，并把 users.group_id 同步为主组（列表展示用）
function setUserGroups(userId, groupIds) {
  const ids = [...new Set(groupIds.map(Number).filter((n) => Number.isInteger(n)))];
  if (ids.length === 0) ids.push(1); // 至少归属默认组
  db.prepare('DELETE FROM user_groups WHERE user_id = ?').run(userId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)');
  for (const gid of ids) ins.run(userId, gid);
  db.prepare('UPDATE users SET group_id = ? WHERE id = ?').run(ids[0], userId);
  return ids;
}

module.exports = { db, getSetting, getUserGroupIds, setUserGroups };
