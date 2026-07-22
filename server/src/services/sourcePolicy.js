// 源站策略：按用户所在组限制可穿透的内网源站
// 条目支持："host"、"host:port"、IPv4 CIDR、"*.suffix" 域名通配

// IPv4 转 32 位整数，非法返回 null
function ipToLong(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

// 主机名匹配：精确或 "*.suffix" 通配
function hostMatch(pattern, host) {
  if (pattern.startsWith('*.')) {
    const bare = pattern.slice(2);
    return host === bare || host.endsWith('.' + bare);
  }
  return pattern === host;
}

// 单条规则匹配
function matchEntry(entry, host, port) {
  entry = String(entry).trim();
  if (!entry) return false;
  // CIDR（仅 IPv4）
  if (entry.includes('/')) {
    const [net, bitsStr] = entry.split('/');
    const bits = parseInt(bitsStr, 10);
    const netN = ipToLong(net);
    const hostN = ipToLong(host);
    if (netN === null || hostN === null || isNaN(bits) || bits < 0 || bits > 32) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (netN & mask) === (hostN & mask);
  }
  // host:port
  const m = entry.match(/^(.+):(\d+)$/);
  if (m) {
    return Number(m[2]) === Number(port) && hostMatch(m[1], host);
  }
  // 纯 host
  return hostMatch(entry, host);
}

// 检查源站是否放行，返回 {allowed, reason?}
function checkSourceAllowed(group, host, port) {
  const mode = group ? group.source_policy_mode : 'none';
  let list = [];
  try {
    list = JSON.parse((group && group.source_policy_list) || '[]');
  } catch (e) { /* 解析失败按空列表 */ }
  if (!Array.isArray(list)) list = [];

  if (!mode || mode === 'none') return { allowed: true };

  const matched = list.some((e) => matchEntry(e, host, port));

  if (mode === 'whitelist') {
    if (list.length === 0) return { allowed: false, reason: '所在组的源站白名单为空，禁止所有源站' };
    return matched
      ? { allowed: true }
      : { allowed: false, reason: `源站 ${host}:${port} 不在所在组的白名单内` };
  }
  if (mode === 'blacklist') {
    return matched
      ? { allowed: false, reason: `源站 ${host}:${port} 命中所在组的黑名单` }
      : { allowed: true };
  }
  return { allowed: true };
}

module.exports = { checkSourceAllowed };
