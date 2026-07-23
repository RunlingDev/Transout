<template>
  <div class="doc">
    <h1>快速开始</h1>
    <p>本页带你从零跑起 Transout，并完成第一条隧道的最短路径。</p>

    <h2>1. 安装与启动（开发模式）</h2>
    <pre><code>make install    # 安装前后端依赖
make dev        # 开发模式：后端 :7321 + 前端 Vite :5173（/api 已代理）</code></pre>
    <p>
      启动后访问 <code>http://localhost:5173</code>。
      开发后台进程需用 <code>make stop</code> 或手动结束；也可以分开启动：
    </p>
    <pre><code>cd server &amp;&amp; npm run dev   # 后端单独（node --watch）
cd web &amp;&amp; npm run dev      # 前端单独</code></pre>

    <h2>2. 首次初始化：创建管理员</h2>
    <p>
      首次访问时系统检测到用户表为空，会引导创建管理员账号（用户名 + 密码，密码至少 6 位）。
      该接口仅在系统未初始化时可用（<code>GET /api/auth/bootstrap</code> 返回
      <code>{ needs_setup: true }</code>），初始化后自动关闭。
    </p>

    <h2>3. 配置二进制路径</h2>
    <p>
      以管理员身份进入「设置」页，配置 <code>frpc</code> 与 <code>ngrok</code> 可执行文件路径
      （留空则默认从 PATH 查找）。保存前可用页面上的检测按钮验证二进制是否可用。
    </p>

    <h2>4. 最短路径：从渠道到可用隧道</h2>
    <ol>
      <li>
        <strong>建渠道</strong>（管理员，「渠道」页）：
        frp 渠道填名称、<code>serverAddr</code>、<code>serverPort</code> 及 token；
        ngrok 渠道填名称与 authtoken。保存后可点「检测」确认对应二进制可用。
      </li>
      <li>
        <strong>授权</strong>（管理员，建渠道时或编辑渠道的授权配置）：
        渠道默认拒绝——没有任何授权记录时仅管理员可见可用。
        按用户组或用户添加授权后，被授权者才能看到并使用该渠道。
      </li>
      <li>
        <strong>建隧道</strong>（「隧道」页，被授权用户或管理员）：
        选择渠道与协议（tcp/http/https），填写内网源站 <code>host:port</code>；
        frp TCP 隧道需指定 <code>remote_port</code>，frp HTTP/HTTPS 隧道需指定
        <code>subdomain</code> 或 <code>domain</code>；ngrok 公网地址由服务分配，启动后自动回读展示。
      </li>
      <li>
        <strong>启动</strong>：在隧道列表用 Switch 一键启动。面板自动拉起
        frpc / ngrok 进程，状态实时刷新；异常时状态变为「异常」并展示 last_error。
      </li>
      <li>
        <strong>验证</strong>：进入隧道详情页，使用「源站测试」与「公网测试」
        确认两端连通（含时延），并查看运行日志。
      </li>
    </ol>

    <blockquote>
      <p>
        提示：创建隧道前请确认源站地址在用户所属组的源站策略允许范围内，
        否则会被拒绝并提示原因（详见「使用指南 → 源站策略」）。
      </p>
    </blockquote>
  </div>
</template>
