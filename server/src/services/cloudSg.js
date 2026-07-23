// 云安全组对接（阿里云 ECS / 腾讯云 CVM）：签名与请求全部基于内置 crypto/https 手写，不引第三方依赖
const crypto = require('crypto');
const https = require('https');

const REQUEST_TIMEOUT = 15000;

// ---------- 通用 ----------

// 简单 https 请求封装，返回 {status, body}
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', (e) => reject(new Error(`网络请求失败：${e.message}`)));
    req.setTimeout(REQUEST_TIMEOUT, () => req.destroy(new Error(`网络请求超时（${REQUEST_TIMEOUT}ms）`)));
    if (body) req.write(body);
    req.end();
  });
}

// 校验 cloud 配置完整性，返回错误消息或 null
function checkCloud(cloud) {
  if (!cloud || typeof cloud !== 'object') return '缺少云安全组配置';
  for (const k of ['regionId', 'securityGroupId', 'accessKeyId', 'accessKeySecret']) {
    if (!cloud[k]) return `云安全组配置缺少 ${k}`;
  }
  return null;
}

// ---------- 阿里云（POP RPC 风格，HMAC-SHA1 签名） ----------

const ALIYUN_HOST = 'ecs.aliyuncs.com';
const ALIYUN_VERSION = '2014-05-26';

// 阿里云 POP 的百分号编码（RFC3986：+ → %20、* → %2A、%7E → ~）
function aliEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

// 构造规范化查询串并计算 Signature（params 不含 Signature 本身）
function aliSign(params, accessKeySecret) {
  const canonicalized = Object.keys(params)
    .sort()
    .map((k) => `${aliEncode(k)}=${aliEncode(params[k])}`)
    .join('&');
  const stringToSign = `GET&${aliEncode('/')}&${aliEncode(canonicalized)}`;
  return crypto.createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64');
}

// 发起阿里云 RPC 调用，API 错误抛中文异常
async function aliRequest(cloud, action, extra) {
  const params = {
    Format: 'JSON',
    Version: ALIYUN_VERSION,
    AccessKeyId: cloud.accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    // 时间戳格式 yyyy-MM-ddTHH:mm:ssZ（不含毫秒）
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Action: action,
    RegionId: cloud.regionId,
    ...extra,
  };
  params.Signature = aliSign(params, cloud.accessKeySecret);
  const qs = Object.keys(params).map((k) => `${aliEncode(k)}=${aliEncode(params[k])}`).join('&');
  const { status, body } = await httpsRequest({ hostname: ALIYUN_HOST, path: '/?' + qs, method: 'GET' });
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`阿里云 ${action} 返回无法解析（HTTP ${status}）`);
  }
  if (data.Code) throw new Error(`阿里云 ${action} 失败：${data.Message || data.Code}`);
  return data;
}

// 判断入方向规则是否已存在（tcp / 指定端口 / 0.0.0.0/0 / accept）
function aliFindRule(attr, port) {
  const perms = (attr.Permissions && attr.Permissions.Permission) || [];
  return perms.find(
    (p) =>
      p.Direction === 'ingress' &&
      p.Policy === 'Accept' &&
      p.IpProtocol === 'TCP' &&
      p.PortRange === `${port}/${port}` &&
      p.SourceCidrIp === '0.0.0.0/0'
  );
}

async function aliAuthorize(cloud, port) {
  const attr = await aliRequest(cloud, 'DescribeSecurityGroupAttribute', {
    SecurityGroupId: cloud.securityGroupId,
    Direction: 'ingress',
  });
  if (aliFindRule(attr, port)) return '安全组规则已存在，跳过放行';
  await aliRequest(cloud, 'AuthorizeSecurityGroup', {
    SecurityGroupId: cloud.securityGroupId,
    IpProtocol: 'tcp',
    PortRange: `${port}/${port}`,
    SourceCidrIp: '0.0.0.0/0',
    Policy: 'accept',
    Description: 'transout 隧道自动放行',
  });
  return `安全组端口 ${port} 放行成功`;
}

async function aliRevoke(cloud, port) {
  const attr = await aliRequest(cloud, 'DescribeSecurityGroupAttribute', {
    SecurityGroupId: cloud.securityGroupId,
    Direction: 'ingress',
  });
  if (!aliFindRule(attr, port)) return '安全组规则不存在，跳过移除';
  await aliRequest(cloud, 'RevokeSecurityGroup', {
    SecurityGroupId: cloud.securityGroupId,
    IpProtocol: 'tcp',
    PortRange: `${port}/${port}`,
    SourceCidrIp: '0.0.0.0/0',
    Policy: 'accept',
  });
  return `安全组端口 ${port} 规则已移除`;
}

// ---------- 腾讯云（TC3-HMAC-SHA256 签名） ----------

const TC_HOST = 'cvm.tencentcloudapi.com';
const TC_SERVICE = 'cvm';
const TC_VERSION = '2017-03-12';
const TC_CONTENT_TYPE = 'application/json; charset=utf-8';

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

// 计算 TC3 签名的 Authorization 头（timestamp 为秒级 Unix 时间戳；body 为待发送的 JSON 字符串）
function tcAuthorization(secretId, secretKey, action, body, timestamp) {
  const algorithm = 'TC3-HMAC-SHA256';
  // 1. 拼接规范请求串（content-type / host / x-tc-action 参与签名，与官方示例一致）
  const canonicalHeaders = `content-type:${TC_CONTENT_TYPE}\nhost:${TC_HOST}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n');
  // 2. 拼接待签名字符串
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const credentialScope = `${date}/${TC_SERVICE}/tc3_request`;
  const stringToSign = [algorithm, timestamp, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  // 3. 计算签名
  const kDate = hmacSha256('TC3' + secretKey, date);
  const kService = hmacSha256(kDate, TC_SERVICE);
  const kSigning = hmacSha256(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// 发起腾讯云 API 调用，API 错误抛中文异常
async function tcRequest(cloud, action, payload) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const { status, body: respBody } = await httpsRequest(
    {
      hostname: TC_HOST,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': TC_CONTENT_TYPE,
        'X-TC-Action': action,
        'X-TC-Version': TC_VERSION,
        'X-TC-Region': cloud.regionId,
        'X-TC-Timestamp': timestamp,
        Authorization: tcAuthorization(cloud.accessKeyId, cloud.accessKeySecret, action, body, timestamp),
      },
    },
    body
  );
  let data;
  try {
    data = JSON.parse(respBody);
  } catch {
    throw new Error(`腾讯云 ${action} 返回无法解析（HTTP ${status}）`);
  }
  const resp = data.Response || {};
  if (resp.Error) throw new Error(`腾讯云 ${action} 失败：${resp.Error.Message || resp.Error.Code}`);
  return resp;
}

// 在入站策略中查找匹配规则（tcp / 指定端口 / 0.0.0.0/0 / accept）
function tcFindRule(describeResp, port) {
  const ingress = (describeResp.SecurityGroupPolicySet && describeResp.SecurityGroupPolicySet.Ingress) || [];
  return ingress.find(
    (p) =>
      String(p.Protocol).toUpperCase() === 'TCP' &&
      String(p.Port) === String(port) &&
      p.CidrBlock === '0.0.0.0/0' &&
      String(p.Action).toUpperCase() === 'ACCEPT'
  );
}

async function tcAuthorize(cloud, port) {
  const desc = await tcRequest(cloud, 'DescribeSecurityGroupPolicies', {
    SecurityGroupId: cloud.securityGroupId,
  });
  if (tcFindRule(desc, port)) return '安全组规则已存在，跳过放行';
  await tcRequest(cloud, 'AuthorizeSecurityGroupPolicies', {
    SecurityGroupId: cloud.securityGroupId,
    SecurityGroupPolicySet: {
      Ingress: [
        {
          Protocol: 'TCP',
          Port: String(port),
          CidrBlock: '0.0.0.0/0',
          Action: 'ACCEPT',
          PolicyDescription: 'transout 隧道自动放行',
        },
      ],
    },
  });
  return `安全组端口 ${port} 放行成功`;
}

async function tcRevoke(cloud, port) {
  const desc = await tcRequest(cloud, 'DescribeSecurityGroupPolicies', {
    SecurityGroupId: cloud.securityGroupId,
  });
  const rule = tcFindRule(desc, port);
  if (!rule) return '安全组规则不存在，跳过移除';
  // 撤销时回传查询到的完整规则，保证与已有策略精确匹配
  const item = {
    Protocol: rule.Protocol,
    Port: rule.Port,
    CidrBlock: rule.CidrBlock,
    Action: rule.Action,
  };
  if (rule.PolicyDescription) item.PolicyDescription = rule.PolicyDescription;
  await tcRequest(cloud, 'RevokeSecurityGroupPolicies', {
    SecurityGroupId: cloud.securityGroupId,
    SecurityGroupPolicySet: { Ingress: [item] },
  });
  return `安全组端口 ${port} 规则已移除`;
}

// ---------- 统一出口 ----------

// 放行规则（幂等）：入方向 tcp / 指定端口 / 0.0.0.0/0 / accept
async function authorizeRule(cloud, port) {
  const err = checkCloud(cloud);
  if (err) throw new Error(err);
  if (cloud.provider === 'aliyun') return aliAuthorize(cloud, port);
  if (cloud.provider === 'tencent') return tcAuthorize(cloud, port);
  throw new Error(`不支持的云厂商：${cloud.provider}`);
}

// 移除规则（幂等）
async function revokeRule(cloud, port) {
  const err = checkCloud(cloud);
  if (err) throw new Error(err);
  if (cloud.provider === 'aliyun') return aliRevoke(cloud, port);
  if (cloud.provider === 'tencent') return tcRevoke(cloud, port);
  throw new Error(`不支持的云厂商：${cloud.provider}`);
}

// 测试连接：校验凭据有效性与安全组可达性，成功返回中文摘要
async function testConnection(cloud) {
  const err = checkCloud(cloud);
  if (err) throw new Error(err);
  if (cloud.provider === 'aliyun') {
    const attr = await aliRequest(cloud, 'DescribeSecurityGroupAttribute', {
      SecurityGroupId: cloud.securityGroupId,
      Direction: 'ingress',
    });
    const n = ((attr.Permissions && attr.Permissions.Permission) || []).length;
    return `连接成功：安全组 ${cloud.securityGroupId} 可达，入方向规则共 ${n} 条`;
  }
  if (cloud.provider === 'tencent') {
    const desc = await tcRequest(cloud, 'DescribeSecurityGroupPolicies', {
      SecurityGroupId: cloud.securityGroupId,
    });
    const n = ((desc.SecurityGroupPolicySet && desc.SecurityGroupPolicySet.Ingress) || []).length;
    return `连接成功：安全组 ${cloud.securityGroupId} 可达，入方向规则共 ${n} 条`;
  }
  throw new Error(`不支持的云厂商：${cloud.provider}`);
}

module.exports = { authorizeRule, revokeRule, testConnection };
