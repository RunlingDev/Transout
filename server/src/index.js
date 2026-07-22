// 服务入口：初始化数据库、清理孤儿状态、挂载路由、监听端口
const express = require('express');
const cors = require('cors');
const { PORT } = require('./config');
require('./db'); // 引入即完成建表与内置数据
const runner = require('./services/runner');

runner.init(); // 上次遗留的 running/starting 一律置为 stopped

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/tunnels', require('./routes/tunnels'));
app.use('/api/settings', require('./routes/settings'));

// API 404
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误处理（含 JSON 解析失败）
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`transout-server 已启动，监听端口 ${PORT}`);
});
