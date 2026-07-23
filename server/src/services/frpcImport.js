// frpc 配置文件（ini / toml）手写解析与隧道条目映射，供导入接口使用
// 仅支持 frpc 常用子集：section / [[proxies]]、字符串、数字、布尔、数组、行注释

// 依次取多个键中第一个有值的
function pick(obj, ...keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// 去掉行注释（# 或 ; 开头的内容，忽略字符串内的字符）
function stripComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === inStr && line[i - 1] !== '\\') inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

// 按逗号切分数组内部（忽略字符串内的逗号）
function splitArrayItems(inner) {
  const items = [];
  let buf = '';
  let inStr = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (inStr) {
      buf += c;
      if (c === inStr && inner[i - 1] !== '\\') inStr = null;
    } else if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
    } else if (c === ',') {
      items.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim()) items.push(buf);
  return items;
}

// 解析 toml 字符串（双引号处理常见转义，单引号原样）
function parseTomlString(s) {
  if (s.startsWith("'")) return s.slice(1, s.lastIndexOf("'"));
  const body = s.slice(1, s.lastIndexOf('"'));
  return body.replace(/\\(["\\nrt])/g, (m, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    return c;
  });
}

// 解析 toml 值：字符串 / 数字 / 布尔 / 数组，兜底按字符串
function parseTomlValue(s) {
  s = s.trim();
  if (s.startsWith('"') || s.startsWith("'")) return parseTomlString(s);
  if (s.startsWith('[')) {
    const end = s.lastIndexOf(']');
    const inner = end > 0 ? s.slice(1, end) : s.slice(1);
    if (!inner.trim()) return [];
    return splitArrayItems(inner).map(parseTomlValue);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  if (s !== '' && !Number.isNaN(n)) return n;
  return s;
}

// 解析 ini：返回 [{ name, kv }]
function parseIni(content) {
  const sections = [];
  let current = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      current = { name: sec[1].trim(), kv: {} };
      sections.push(current);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0 || !current) continue; // 段外或无等号的行忽略
    current.kv[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return sections;
}

// 解析 toml 子集：返回 { root, proxies }
function parseToml(content) {
  const root = {};
  const proxies = [];
  let target = root;
  let inProxies = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const arrayTable = line.match(/^\[\[(.+)\]\]$/);
    if (arrayTable) {
      inProxies = arrayTable[1].trim() === 'proxies';
      target = {};
      if (inProxies) proxies.push(target);
      continue;
    }
    if (/^\[.+\]$/.test(line)) { // 普通表，忽略其内容
      inProxies = false;
      target = {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    if (target !== root && !inProxies) continue; // 非 proxies 表的键值不入结果
    target[line.slice(0, eq).trim()] = parseTomlValue(line.slice(eq + 1));
  }
  return { root, proxies };
}

// 嗅探格式：'ini' / 'toml' / null
function sniffFormat(content) {
  if (/^\s*\[\s*common\s*\]/im.test(content)) return 'ini';
  if (/^\s*\[\[\s*proxies\s*\]\]/m.test(content)) return 'toml';
  const m = content.match(/^\s*(\[\[?)/m);
  if (m) return m[1] === '[[' ? 'toml' : 'ini';
  if (/^\s*(serverAddr|server_addr)\s*=/m.test(content)) return 'toml';
  return null;
}

// 取 custom_domains 的第一个值（toml 数组取首项，ini 逗号分隔取首项）
function firstDomain(v) {
  if (Array.isArray(v)) return v.length ? String(v[0]).trim() : undefined;
  if (typeof v === 'string' && v.includes(',')) return v.split(',')[0].trim() || undefined;
  return v;
}

// 把一段配置映射为隧道字段；不支持的协议直接返回带 error 的条目
function mapEntry(raw, fallbackName, index) {
  const name = String(pick(raw, 'name') ?? fallbackName ?? '').trim() || null;
  const label = name || `第 ${index + 1} 条`;
  const proto = String(pick(raw, 'type') || 'tcp').trim();
  if (!['tcp', 'http', 'https'].includes(proto)) {
    return { name: label, error: `不支持的协议类型 ${proto}（仅支持 tcp/http/https）` };
  }
  return {
    name,
    proto,
    source_host: String(pick(raw, 'local_ip', 'localIP') || '127.0.0.1'),
    source_port: pick(raw, 'local_port', 'localPort'),
    remote_port: pick(raw, 'remote_port', 'remotePort'),
    subdomain: pick(raw, 'subdomain'),
    domain: firstDomain(pick(raw, 'custom_domains', 'customDomains')),
  };
}

// 解析 frpc 配置内容，返回 { serverAddr, serverPort, token, tunnels }；失败抛中文错误
function parseFrpcConfig(content) {
  if (!content || !String(content).trim()) throw new Error('配置内容为空');
  content = String(content);
  const format = sniffFormat(content);
  if (!format) throw new Error('无法识别配置格式：既不是 frpc ini 也不是 toml');

  let serverAddr;
  let serverPort;
  let token;
  let tunnels;
  if (format === 'ini') {
    const sections = parseIni(content);
    const common = sections.find((s) => s.name.toLowerCase() === 'common');
    const kv = common ? common.kv : {};
    serverAddr = pick(kv, 'server_addr', 'serverAddr');
    serverPort = pick(kv, 'server_port', 'serverPort');
    token = pick(kv, 'token', 'auth.token');
    tunnels = sections
      .filter((s) => s.name.toLowerCase() !== 'common')
      .map((s, i) => mapEntry(s.kv, s.name, i));
  } else {
    const { root, proxies } = parseToml(content);
    serverAddr = pick(root, 'serverAddr', 'server_addr');
    serverPort = pick(root, 'serverPort', 'server_port');
    token = pick(root, 'auth.token', 'token');
    tunnels = proxies.map((p, i) => mapEntry(p, null, i));
  }

  if (!serverAddr || !String(serverAddr).trim()) {
    throw new Error('配置中缺少 serverAddr（frps 服务器地址）');
  }
  if (!tunnels.length) throw new Error('配置中没有可导入的隧道条目');
  const port = Number(serverPort);
  return {
    serverAddr: String(serverAddr).trim(),
    serverPort: Number.isInteger(port) && port > 0 ? port : null,
    token: token !== undefined && token !== null && String(token).trim() !== '' ? String(token).trim() : null,
    tunnels,
  };
}

// 按 serverAddr + server_port + token 匹配 frp 渠道（配置里提供了哪项就校验哪项）。
// 返回 { channel, hint }：未匹配时 hint 为中文原因（区分无此 serverAddr / 端口或 token 不一致）
function findFrpChannel(db, { serverAddr, serverPort, token }) {
  const rows = db.prepare("SELECT * FROM channels WHERE type = 'frp'").all();
  const sameAddr = [];
  for (const ch of rows) {
    let cfg = {};
    try {
      cfg = JSON.parse(ch.config || '{}');
    } catch {
      continue;
    }
    if (String(cfg.serverAddr || '').trim() !== serverAddr) continue;
    sameAddr.push(cfg);
    if (serverPort && Number(cfg.serverPort) !== serverPort) continue;
    if (token && String(cfg.token || '') !== token) continue;
    return { channel: ch, hint: null };
  }
  const hint = sameAddr.length
    ? `存在 serverAddr 为 ${serverAddr} 的 frp 渠道，但 server_port 或 token 不匹配`
    : `没有 serverAddr 为 ${serverAddr} 的 frp 渠道`;
  return { channel: null, hint };
}

module.exports = { parseFrpcConfig, findFrpChannel };
