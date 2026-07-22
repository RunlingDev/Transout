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
`);

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

module.exports = { db, getSetting };
