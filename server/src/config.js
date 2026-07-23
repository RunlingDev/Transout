// 全局配置：监听地址、端口、数据目录、JWT 密钥
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// JWT 密钥持久化在 data/secret，首次启动随机生成
function loadSecret() {
  const secretFile = path.join(DATA_DIR, 'secret');
  try {
    const s = fs.readFileSync(secretFile, 'utf8').trim();
    if (s) return s;
  } catch (e) { /* 文件不存在则生成 */ }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretFile, s, { mode: 0o600 });
  return s;
}

module.exports = {
  HOST: process.env.HOST || '0.0.0.0',
  PORT: parseInt(process.env.PORT || '7321', 10),
  DATA_DIR,
  JWT_SECRET: loadSecret(),
};
