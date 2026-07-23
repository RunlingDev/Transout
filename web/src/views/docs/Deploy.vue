<template>
  <div class="doc">
    <h1>部署</h1>
    <p>Transout 生产部署为「sqlite + nginx」模式：后端监听 127.0.0.1，由 nginx 反代并托管前端静态产物。</p>

    <h2>一键部署（推荐）</h2>
    <p>
      <code>deploy/install.sh</code> 一条命令完成：构建前端、安装后端到
      <code>/opt/transout</code>、部署前端产物到 <code>/var/www/transout</code>、
      生成 nginx 配置、注册并启用 systemd 服务。需在仓库根目录以 root 执行：
    </p>
    <pre><code>sudo bash deploy/install.sh                      # 全默认
sudo bash deploy/install.sh --domain example.com # 指定域名
sudo bash deploy/install.sh --skip-nginx         # 只装后端 + systemd</code></pre>
    <table>
      <thead>
        <tr><th>参数</th><th>默认值</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td><code>--app-dir</code></td><td><code>/opt/transout</code></td><td>后端安装目录</td></tr>
        <tr><td><code>--web-root</code></td><td><code>/var/www/transout</code></td><td>前端静态产物目录</td></tr>
        <tr><td><code>--port</code></td><td><code>7321</code></td><td>后端监听端口（绑 127.0.0.1，由 nginx 反代）</td></tr>
        <tr><td><code>--domain</code></td><td><code>_</code></td><td>nginx server_name，<code>_</code> 表示默认站点</td></tr>
        <tr><td><code>--user</code></td><td><code>$SUDO_USER</code>（否则 <code>transout</code>）</td><td>systemd 服务运行用户，须已存在</td></tr>
        <tr><td><code>--skip-nginx</code></td><td>—</td><td>跳过 nginx 配置生成，只装后端 + systemd</td></tr>
        <tr><td><code>--skip-systemd</code></td><td>—</td><td>跳过 systemd 单元注册</td></tr>
      </tbody>
    </table>
    <p>前置要求：已安装 node、npm（配置 nginx 时还需 nginx）。部署完成后首次访问请创建管理员账号。</p>

    <h2>手动部署</h2>
    <pre><code>make start                        # 构建前端并后台启动后端（127.0.0.1:7321）
sudo mkdir -p /var/www/transout
sudo make deploy                  # 前端产物同步到 /var/www/transout
# 参考 deploy/nginx.conf.example 配置 nginx 并重载</code></pre>
    <p>进程管理：</p>
    <pre><code>make stop      # 停止后端
make restart   # 重启后端
make status    # 查看运行状态</code></pre>
    <p>
      <code>make start</code> 以后台方式运行后端，pid 记录在 <code>server/data/server.pid</code>，
      输出日志在 <code>server/data/server.log</code>。后端常驻也可参考
      <code>deploy/transout.service.example</code> 使用 systemd。
    </p>

    <h2>nginx 反代</h2>
    <p>nginx 负责托管前端产物并把 <code>/api/</code> 反代到后端，要点如下（完整示例见 <code>deploy/nginx.conf.example</code>）：</p>
    <pre><code>server {
    listen 80;
    server_name example.com;

    root /var/www/transout;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA history 模式回退
    }

    location /api/ {
        proxy_pass http://127.0.0.1:7321;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}</code></pre>

    <h2>systemd</h2>
    <p>
      后端常驻推荐用 systemd 托管（<code>deploy/transout.service.example</code>，一键部署会自动生成）。
      关键配置：<code>User</code> 指定运行用户，<code>WorkingDirectory</code> 指向后端安装目录，
      环境变量 <code>PORT</code>（监听端口）与 <code>DATA_DIR</code>（数据目录），
      <code>Restart=on-failure</code> 保证异常退出后自动拉起。日志查看：
    </p>
    <pre><code>journalctl -u transout -f</code></pre>

    <h2>数据目录 server/data</h2>
    <p>
      所有运行数据都落在数据目录（开发时为 <code>server/data/</code>，一键部署时为
      <code>/opt/transout/data</code>，由 <code>DATA_DIR</code> 环境变量指定），该目录已 gitignore：
    </p>
    <ul>
      <li>SQLite 数据库（用户、用户组、渠道、隧道、授权、设置等全部业务数据）；</li>
      <li><code>secret</code> — JWT 签名密钥，<strong>删除会使所有已登录会话失效</strong>；</li>
      <li><code>runtime/</code> — 自动生成的 frpc ini 与 ngrok yml 运行配置；</li>
      <li><code>logs/</code> — 每条隧道的进程运行日志；</li>
      <li><code>server.pid</code> / <code>server.log</code> — <code>make start</code> 的进程号文件与输出日志。</li>
    </ul>
    <p>备份时整体拷贝数据目录即可；升级后端代码不会触碰该目录。</p>

    <h2>frpc / ngrok 二进制</h2>
    <p>
      面板不自带穿透二进制，需自行安装 <code>frpc</code> 与 <code>ngrok</code>，
      并在「设置」页配置可执行文件路径（<code>frpc_path</code> / <code>ngrok_path</code>，默认从 PATH 查找）。
      二进制缺失时隧道会进入「异常」状态并给出明确提示，不影响面板其余功能。
    </p>
  </div>
</template>
