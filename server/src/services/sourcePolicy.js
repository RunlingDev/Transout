// 源站策略：按用户所属全部用户组聚合判定
// 条目支持："host"、"host:port"、IPv4 CIDR、"*.suffix" 域名通配
// 用户属于多个白名单组时，按其 source_policy_combine 设置合并：
//   union=并集（任一白名单放行即可），intersection=交集（每个白名单组都必须放行）
// 黑名单不受合并策略影响：命中任一黑名单组列表即拒绝
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

// 检查源站是否放行（聚合用户全部所属组的策略），返回 {allowed, reason?}
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

  const whitelistGroups = groups.filter((g) => g.source_policy_mode === 'whitelist');
  const blacklistGroups = groups.filter((g) => g.source_policy_mode === 'blacklist');

  if (whitelistGroups.length > 0) {
    if (user.source_policy_combine === 'intersection') {
      // 交集：每个白名单组的列表都必须各自命中
      for (const g of whitelistGroups) {
        const list = parseList(g);
        if (list.length === 0) {
          return { allowed: false, reason: `所在组「${g.name}」的源站白名单为空，交集策略下禁止所有源站` };
        }
        if (!list.some((e) => matchEntry(e, host, port))) {
          return { allowed: false, reason: `源站 ${host}:${port} 不在所在组「${g.name}」的白名单内（交集策略需全部命中）` };
        }
      }
    } else {
      // 并集：命中任一白名单组的列表即可
      const union = whitelistGroups.flatMap(parseList);
      if (union.length === 0) {
        return { allowed: false, reason: '所在组的源站白名单为空，禁止所有源站' };
      }
      if (!union.some((e) => matchEntry(e, host, port))) {
        return { allowed: false, reason: `源站 ${host}:${port} 不在所在组的白名单内` };
      }
    }
  }

  for (const g of blacklistGroups) {
    if (parseList(g).some((e) => matchEntry(e, host, port))) {
      return { allowed: false, reason: `源站 ${host}:${port} 命中所在组「${g.name}」的黑名单` };
    }
  }

  return { allowed: true };
}

module.exports = { checkSourceAllowed };
