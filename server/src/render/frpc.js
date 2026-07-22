// 渲染 frpc ini 配置：同一渠道的所有启用隧道共用一个进程
// 段名统一用 tunnel-<id>，避免用户输入特殊字符
function renderFrpcConfig(channel, tunnels) {
  const cfg = JSON.parse(channel.config || '{}');
  let out = '[common]\n';
  out += `server_addr = ${cfg.serverAddr}\n`;
  out += `server_port = ${cfg.serverPort}\n`;
  if (cfg.token) out += `token = ${cfg.token}\n`;

  for (const t of tunnels) {
    out += `\n[tunnel-${t.id}]\n`;
    out += `type = ${t.proto}\n`;
    out += `local_ip = ${t.source_host}\n`;
    out += `local_port = ${t.source_port}\n`;
    if (t.proto === 'tcp') {
      out += `remote_port = ${t.remote_port}\n`;
    } else {
      if (t.subdomain) out += `subdomain = ${t.subdomain}\n`;
      if (t.domain) out += `custom_domains = ${t.domain}\n`;
    }
  }
  return out;
}

module.exports = { renderFrpcConfig };
