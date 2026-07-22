// 渲染 ngrok yml 配置：每隧道独立文件，手写文本不引 yaml 库
// 返回 { yml, name }，name 为隧道段名（ngrok start <name> 使用）
function renderNgrokConfig(channel, tunnel) {
  const cfg = JSON.parse(channel.config || '{}');
  const name = `tunnel-${tunnel.id}`;
  let yml = 'version: "2"\n';
  yml += `authtoken: ${cfg.authtoken}\n`;
  if (cfg.region) yml += `region: ${cfg.region}\n`;
  yml += 'tunnels:\n';
  yml += `  ${name}:\n`;
  yml += `    proto: ${tunnel.proto}\n`;
  yml += `    addr: "${tunnel.source_host}:${tunnel.source_port}"\n`;
  if (tunnel.domain) yml += `    domain: ${tunnel.domain}\n`;
  return { yml, name };
}

module.exports = { renderNgrokConfig };
