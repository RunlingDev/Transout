// 源站策略：每个用户组定义一个"允许集合"——
//   不限制(none)=全集；白名单=名单集合；黑名单=名单的补集
// 用户属于多个组时，按其 source_policy_combine 设置对各组允许集合作并集或交集：
//   union=并集（任一组允许即可）；intersection=交集（所有组都允许才行）
// 条目支持："host"、"host:port"、IPv4 CIDR、"*.suffix" 域名通配
const { db, getUserGroupIds } = require('../db');

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

// 单组判定：源站是否落在该组的允许集合内
function groupAllows(g, host, port, parseList) {
  const list = parseList(g);
  const matched = list.some((e) => matchEntry(e, host, port));
  if (g.source_policy_mode === 'whitelist') return matched; // 白名单集合
  if (g.source_policy_mode === 'blacklist') return !matched; // 黑名单的补集
  return true; // 不限制=全集
}

// 检查源站是否放行（按用户设置对各组允许集合作并/交集），返回 {allowed, reason?}
function checkSourceAllowed(user, host, port) {
  const gids = getUserGroupIds(user.id);
  const groups = gids.length
    ? db.prepare(`SELECT * FROM groups WHERE id IN (${gids.map(() => '?').join(',')})`).all(...gids)
    : [];

  const parseList = (g) => {
    try {
      const l = JSON.parse(g.source_policy_list || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) {
      return [];
    }
  };

  if (groups.length === 0) {
    return { allowed: false, reason: '用户不属于任何用户组，禁止所有源站' };
  }

  if (user.source_policy_combine === 'intersection') {
    // 交集：所有组的允许集合都必须包含该源站
    for (const g of groups) {
      if (!groupAllows(g, host, port, parseList)) {
        return { allowed: false, reason: `源站 ${host}:${port} 不被所在组「${g.name}」允许（交集策略需全部组允许）` };
      }
    }
    return { allowed: true };
  }

  // 并集：任一组的允许集合包含该源站即可
  if (groups.some((g) => groupAllows(g, host, port, parseList))) {
    return { allowed: true };
  }
  return { allowed: false, reason: `源站 ${host}:${port} 不被任何所在组允许` };
}

module.exports = { checkSourceAllowed };
