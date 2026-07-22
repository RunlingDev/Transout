// 渲染 ngrok yml 配置：每隧道独立文件，手写文本不引 yaml 库
// 返回 { yml, name, agentPort }，name 为隧道段名（ngrok start <name> 使用）
// agentPort 为该隧道 ngrok 进程的本地 agent API 端口，用于回读公网地址
function renderNgrokConfig(channel, tunnel) {
  const cfg = JSON.parse(channel.config || '{}');
  const name = `tunnel-${tunnel.id}`;
  const agentPort = 4040 + tunnel.id;
  // ngrok v3 没有 https 协议段：http 隧道的公网入口本身同时提供 https
  const proto = tunnel.proto === 'https' ? 'http' : tunnel.proto;
  let yml = 'version: "2"\n';
  yml += `authtoken: ${cfg.authtoken}\n`;
  if (cfg.region) yml += `region: ${cfg.region}\n`;
  yml += `web_addr: 127.0.0.1:${agentPort}\n`;
  yml += 'tunnels:\n';
  yml += `  ${name}:\n`;
  yml += `    proto: ${proto}\n`;
  yml += `    addr: "${tunnel.source_host}:${tunnel.source_port}"\n`;
  if (tunnel.domain) yml += `    domain: ${tunnel.domain}\n`;
  return { yml, name, agentPort };
}

module.exports = { renderNgrokConfig };
