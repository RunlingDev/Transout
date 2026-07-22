// 隧道连通性测试：源站 TCP 探测、公网入口探测（含时延）
const net = require('net');
const http = require('http');
const https = require('https');

// TCP 连接探测，返回 {ok, latency_ms, error?}
function tcpCheck(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    let done = false;
    const finish = (ok, extra) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, latency_ms: Date.now() - start, ...extra });
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false, { error: '连接超时' }));
    sock.once('error', (e) => finish(false, { error: e.message }));
    sock.connect(Number(port), host);
  });
}

// HTTP(S) 请求探测，返回 {ok, latency_ms, detail?/error?}
function httpCheck(url, timeout = 8000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mod = url.startsWith('https:') ? https : http;
    const finish = (r) => resolve({ latency_ms: Date.now() - start, ...r });
    const req = mod.get(url, {
      headers: { 'User-Agent': 'transout-check', 'ngrok-skip-browser-warning': '1' },
      timeout,
    }, (res) => {
      res.resume();
      finish({ ok: res.statusCode < 500, detail: `HTTP ${res.statusCode}` });
    });
    req.on('timeout', () => { req.destroy(); finish({ ok: false, error: '请求超时' }); });
    req.on('error', (e) => finish({ ok: false, error: e.message }));
  });
}

// 公网端测试：按渠道类型推导公网入口
// frp tcp → serverAddr:remote_port；frp http(s) → domain 或 subdomain.serverAddr；ngrok → public_url
async function publicCheck(tunnel, channel) {
  if (!tunnel.enabled || tunnel.status !== 'running') {
    return { ok: false, error: '隧道未在运行，无法测试公网端' };
  }
  const cfg = JSON.parse(channel.config || '{}');
  if (channel.type === 'ngrok') {
    if (!tunnel.public_url) return { ok: false, error: '公网地址尚未获取，请稍候再试' };
    return httpCheck(`${tunnel.public_url}/`);
  }
  if (tunnel.proto === 'tcp') {
    if (!tunnel.remote_port) return { ok: false, error: '未配置 remote_port' };
    return tcpCheck(cfg.serverAddr, tunnel.remote_port);
  }
  const host = tunnel.domain || (tunnel.subdomain ? `${tunnel.subdomain}.${cfg.serverAddr}` : null);
  if (!host) return { ok: false, error: '未配置 domain/subdomain' };
  return httpCheck(`http://${host}/`);
}

module.exports = { tcpCheck, httpCheck, publicCheck };
