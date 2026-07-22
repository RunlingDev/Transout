// 隧道进程管理：frp 每渠道一个共享 frpc 进程，ngrok 每隧道一个进程
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { db, getSetting } = require('../db');
const { DATA_DIR } = require('../config');
const { renderFrpcConfig } = require('../render/frpc');
const { renderNgrokConfig } = require('../render/ngrok');

const RUNTIME_DIR = path.join(DATA_DIR, 'runtime');
const LOG_DIR = path.join(DATA_DIR, 'logs');
fs.mkdirSync(RUNTIME_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

// 内存中的进程登记表
const frpcProcs = new Map(); // channelId -> child
const ngrokProcs = new Map(); // tunnelId -> child

function logFile(tunnelId) {
  return path.join(LOG_DIR, `tunnel-${tunnelId}.log`);
}

// 读取日志末尾几行，用于 last_error
function tailLog(file, max = 4096) {
  try {
    const size = fs.statSync(file).size;
    const start = Math.max(0, size - max);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8').trim().split('\n').slice(-5).join('\n');
  } catch (e) {
    return '';
  }
}

// 检查二进制是否可执行（含 / 走绝对/相对路径，否则搜索 PATH）
function binaryExists(bin) {
  if (!bin) return false;
  const candidates = bin.includes('/')
    ? [bin]
    : (process.env.PATH || '').split(path.delimiter).map((p) => path.join(p, bin));
  return candidates.some((c) => {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return true;
    } catch (e) {
      return false;
    }
  });
}

// 杀进程树（detached 子进程自成进程组，pgid = pid）
function killTree(child) {
  if (!child || !child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (e) {
    try { child.kill('SIGTERM'); } catch (e2) { /* 已退出 */ }
  }
}

function getTunnel(id) {
  return db.prepare('SELECT * FROM tunnels WHERE id = ?').get(id);
}

function setTunnelError(id, msg) {
  db.prepare("UPDATE tunnels SET status = 'error', last_error = ? WHERE id = ?").run(msg, id);
}

// ---- frp：整渠道重启 ----

function restartFrpcChannel(channelId) {
  const old = frpcProcs.get(channelId);
  if (old) {
    frpcProcs.delete(channelId);
    killTree(old);
  }
  const enabled = db.prepare('SELECT * FROM tunnels WHERE channel_id = ? AND enabled = 1').all(channelId);
  if (enabled.length === 0) return; // 没有启用隧道则不再拉起

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  const bin = getSetting('frpc_path') || 'frpc';
  if (!binaryExists(bin)) {
    for (const t of enabled) {
      setTunnelError(t.id, `未找到 frpc 二进制（${bin}），请在设置中配置正确的 frpc 路径`);
    }
    return;
  }

  const cfgPath = path.join(RUNTIME_DIR, `frpc-channel-${channelId}.ini`);
  fs.writeFileSync(cfgPath, renderFrpcConfig(channel, enabled));

  const child = spawn(bin, ['-c', cfgPath], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  frpcProcs.set(channelId, child);

  // 输出写入该渠道每个启用隧道的日志文件
  const streams = enabled.map((t) => fs.createWriteStream(logFile(t.id), { flags: 'a' }));
  for (const s of streams) {
    child.stdout.pipe(s);
    child.stderr.pipe(s);
  }
  child.on('exit', () => streams.forEach((s) => s.end()));

  if (child.pid) {
    db.prepare('UPDATE tunnels SET pid = ? WHERE channel_id = ? AND enabled = 1').run(child.pid, channelId);
  }

  const markError = (msg) => {
    for (const t of enabled) {
      db.prepare("UPDATE tunnels SET status = 'error', last_error = ? WHERE id = ? AND enabled = 1").run(msg, t.id);
    }
  };

  child.on('error', (err) => {
    if (frpcProcs.get(channelId) === child) frpcProcs.delete(channelId);
    markError(err.code === 'ENOENT'
      ? `未找到 frpc 二进制（${bin}），请在设置中配置正确的 frpc 路径`
      : `frpc 启动失败：${err.message}`);
  });

  child.on('exit', (code, signal) => {
    if (frpcProcs.get(channelId) !== child) return; // 已被新进程替换或主动停止
    frpcProcs.delete(channelId);
    const tail = tailLog(logFile(enabled[0].id));
    markError(`frpc 进程意外退出（code=${code} signal=${signal || '无'}）${tail ? '\n' + tail : ''}`);
  });

  // 1.5 秒后仍存活视为运行中
  const timer = setTimeout(() => {
    if (frpcProcs.get(channelId) === child && child.exitCode === null) {
      db.prepare("UPDATE tunnels SET status = 'running' WHERE channel_id = ? AND enabled = 1 AND status = 'starting'").run(channelId);
    }
  }, 1500);
  timer.unref();
}

// ---- ngrok：每隧道独立进程 ----

function startNgrokTunnel(tunnelId) {
  const t = getTunnel(tunnelId);
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id);
  const bin = getSetting('ngrok_path') || 'ngrok';
  if (!binaryExists(bin)) {
    setTunnelError(tunnelId, `未找到 ngrok 二进制（${bin}），请在设置中配置正确的 ngrok 路径`);
    return;
  }

  const { yml, name } = renderNgrokConfig(channel, t);
  const cfgPath = path.join(RUNTIME_DIR, `ngrok-${tunnelId}.yml`);
  fs.writeFileSync(cfgPath, yml);

  const outFd = fs.openSync(logFile(tunnelId), 'a');
  const child = spawn(bin, ['start', '--config', cfgPath, name], {
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  ngrokProcs.set(tunnelId, child);
  if (child.pid) db.prepare('UPDATE tunnels SET pid = ? WHERE id = ?').run(child.pid, tunnelId);

  child.on('error', (err) => {
    if (ngrokProcs.get(tunnelId) === child) ngrokProcs.delete(tunnelId);
    setTunnelError(tunnelId, err.code === 'ENOENT'
      ? `未找到 ngrok 二进制（${bin}），请在设置中配置正确的 ngrok 路径`
      : `ngrok 启动失败：${err.message}`);
  });

  child.on('exit', (code, signal) => {
    if (ngrokProcs.get(tunnelId) !== child) return; // 主动停止
    ngrokProcs.delete(tunnelId);
    const cur = getTunnel(tunnelId);
    if (cur && cur.enabled) {
      const tail = tailLog(logFile(tunnelId));
      setTunnelError(tunnelId, `ngrok 进程意外退出（code=${code} signal=${signal || '无'}）${tail ? '\n' + tail : ''}`);
    }
  });

  const timer = setTimeout(() => {
    if (ngrokProcs.get(tunnelId) === child && child.exitCode === null) {
      db.prepare("UPDATE tunnels SET status = 'running' WHERE id = ? AND status = 'starting'").run(tunnelId);
    }
  }, 1500);
  timer.unref();
}

// ---- 对外接口 ----

function startTunnel(tunnel) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(tunnel.channel_id);
  db.prepare("UPDATE tunnels SET enabled = 1, status = 'starting', pid = NULL, last_error = NULL WHERE id = ?").run(tunnel.id);
  if (channel.type === 'frp') restartFrpcChannel(channel.id);
  else startNgrokTunnel(tunnel.id);
  return getTunnel(tunnel.id);
}

function stopTunnel(tunnel) {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(tunnel.channel_id);
  db.prepare("UPDATE tunnels SET enabled = 0, status = 'stopped', pid = NULL WHERE id = ?").run(tunnel.id);
  if (channel.type === 'frp') {
    restartFrpcChannel(channel.id); // 重写配置重启；无启用隧道时直接停掉
  } else {
    const child = ngrokProcs.get(tunnel.id);
    ngrokProcs.delete(tunnel.id);
    killTree(child);
  }
  return getTunnel(tunnel.id);
}

// 停止某渠道下所有运行中的隧道（删除渠道前调用）
function stopChannelTunnels(channelId) {
  const rows = db.prepare('SELECT * FROM tunnels WHERE channel_id = ? AND enabled = 1').all(channelId);
  for (const t of rows) stopTunnel(t);
}

// 服务启动时清理上次遗留的运行状态（孤儿进程不在管辖内，需用户重新启动隧道）
function init() {
  db.prepare("UPDATE tunnels SET status = 'stopped', pid = NULL WHERE status IN ('running', 'starting')").run();
}

module.exports = { startTunnel, stopTunnel, stopChannelTunnels, init };
