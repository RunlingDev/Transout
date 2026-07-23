<template>
  <div class="doc">
    <h1>部署</h1>
    <p>Transout 生产部署为「sqlite + nginx」模式：后端监听 127.0.0.1，由 nginx 反代并托管前端静态产物。</p>

    <h2>一键部署（推荐）</h2>
    <p>
      无需克隆仓库，一行命令即可完成安装（脚本自动从 GitHub 拉取源码到
      <code>/opt/transout-repo</code>，可用 <code>--repo-dir</code> 覆盖）：
    </p>
    <pre><code>curl -fsSL https://github.com/RunlingDev/Transout/raw/refs/heads/main/deploy/install.sh | sudo bash</code></pre>
    <p>
      依赖缺失时会<strong>询问是否自动安装</strong>（<code>-y</code> 免询问）：Node.js/npm、nginx 走
      <code>apt</code>（仅 Debian/Ubuntu）；<strong>ngrok</strong> 按官方文档配置 apt 源安装；
      <strong>frp（frpc）</strong>从 GitHub 发布页下载对应架构版本装到 <code>/usr/local/bin</code>。
      跳过的二进制可稍后在面板「设置」中配置路径。
    </p>
    <p>
      已在仓库内时，<code>deploy/install.sh</code> 一条命令完成：构建前端、安装后端到
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
        <tr><td><code>--port</code></td><td><code>80</code></td><td>nginx 监听端口；后端端口固定 7321（绑 127.0.0.1），由 nginx 反代</td></tr>
        <tr><td><code>--domain</code></td><td><code>_</code></td><td>nginx server_name，<code>_</code> 表示默认站点</td></tr>
        <tr><td><code>--user</code></td><td><code>$SUDO_USER</code>（否则 <code>transout</code>）</td><td>systemd 服务运行用户，须已存在</td></tr>
        <tr><td><code>--repo-dir</code></td><td><code>/opt/transout-repo</code></td><td>一行安装模式下仓库克隆位置</td></tr>
        <tr><td><code>-y, --yes</code></td><td>—</td><td>依赖缺失时不再询问，自动安装</td></tr>
        <tr><td><code>--skip-nginx</code></td><td>—</td><td>跳过 nginx 配置生成，只装后端 + systemd</td></tr>
        <tr><td><code>--skip-systemd</code></td><td>—</td><td>跳过 systemd 单元注册</td></tr>
      </tbody>
    </table>
    <p>前置要求：Debian/Ubuntu 推荐；node、npm、nginx 等缺失依赖可由脚本询问后自动安装。部署完成后首次访问请创建管理员账号。</p>

    <h3>一键升级</h3>
    <p>
      脚本会检测 <code>--app-dir</code> 下是否已有后端代码：有则自动进入<strong>升级模式</strong>——
      拉取新代码构建、更新后端与前端产物、按 package-lock.json 变化更新依赖、重启服务；
      <strong>不触碰</strong>数据目录（<code>data/</code>）、已存在的 systemd 单元与 nginx 配置。
      升级时如需重写 nginx 配置（换域名/端口），显式再传一次 <code>--domain</code> 或 <code>--port</code> 即可：
    </p>
    <pre><code>git pull && sudo bash deploy/install.sh                       # 一键升级（保留全部现有配置）
git pull && sudo bash deploy/install.sh --port 8080           # 升级并重写 nginx 监听端口</code></pre>

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
      环境变量 <code>HOST</code>（绑 <code>127.0.0.1</code>，仅 nginx 反代可达）、<code>PORT</code>（后端端口 7321）与 <code>DATA_DIR</code>（数据目录），
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
