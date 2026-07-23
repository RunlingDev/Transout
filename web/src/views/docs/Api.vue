<template>
  <div class="doc">
    <h1>API 参考</h1>
    <p>
      后端为 Express 应用，全部接口前缀 <code>/api</code>，默认监听 <code>7321</code> 端口
      （环境变量 <code>PORT</code> 可覆盖）。API 响应带 <code>Cache-Control: no-store</code>，保证状态实时。
    </p>

    <h2>认证约定</h2>
    <p>
      除登录与初始化接口外，所有接口需要 JWT Bearer 认证：
    </p>
    <pre><code>Authorization: Bearer &lt;token&gt;</code></pre>
    <p>
      token 由登录 / 初始化接口签发，有效期 7 天，签名密钥存于数据目录的 <code>secret</code> 文件。
    </p>
    <h2>错误约定</h2>
    <p>
      所有错误统一返回 JSON <code>{ "error": "错误描述" }</code>，配合 HTTP 状态码：
      <code>400</code> 参数或状态错误、<code>401</code> 未认证或凭据错误、<code>403</code> 无权限、
      <code>404</code> 资源不存在、<code>409</code> 冲突（如用户名/组名已存在）、<code>500</code> 服务器内部错误。
    </p>
    <p>
      权限列说明：<strong>公开</strong> = 无需认证；<strong>登录</strong> = 任意已认证用户；
      <strong>管理员</strong> = 仅管理员；<strong>所有者</strong> = 隧道所有者或管理员。
    </p>

    <h2>认证 <code>/api/auth</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/auth/bootstrap</code></td><td>公开</td><td>查询是否需要初始化（<code>{ needs_setup }</code>，用户表为空时为 true）</td></tr>
        <tr><td>POST</td><td><code>/auth/bootstrap</code></td><td>公开</td><td>初始化：仅当用户表为空时创建首个管理员，返回 token 与用户信息</td></tr>
        <tr><td>POST</td><td><code>/auth/login</code></td><td>公开</td><td>登录，返回 <code>{ token, user }</code></td></tr>
        <tr><td>GET</td><td><code>/auth/me</code></td><td>登录</td><td>获取当前用户信息（含所属用户组）</td></tr>
        <tr><td>PUT</td><td><code>/auth/password</code></td><td>登录</td><td>修改自己的密码（需校验旧密码，新密码至少 6 位）</td></tr>
        <tr><td>PUT</td><td><code>/auth/email</code></td><td>登录</td><td>修改自己的邮箱（空串表示清除，用于 Cravatar/Gravatar 头像）</td></tr>
      </tbody>
    </table>

    <h2>用户 <code>/api/users</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/users</code></td><td>管理员</td><td>用户列表（含各用户所属组）</td></tr>
        <tr><td>POST</td><td><code>/users</code></td><td>管理员</td><td>创建用户；可指定 <code>is_admin</code>、<code>email</code>、<code>group_ids</code>（默认归入默认组）、<code>source_policy_combine</code></td></tr>
        <tr><td>PUT</td><td><code>/users/:id</code></td><td>管理员</td><td>修改用户：密码、管理员标记、邮箱、用户组、源站合并策略；不能把自己降为非管理员</td></tr>
        <tr><td>DELETE</td><td><code>/users/:id</code></td><td>管理员</td><td>删除用户（不能删除自己），同时清理其组成员关系与按用户的渠道授权</td></tr>
      </tbody>
    </table>

    <h2>用户组 <code>/api/groups</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/groups</code></td><td>管理员</td><td>用户组列表（含源站策略与成员数）</td></tr>
        <tr><td>POST</td><td><code>/groups</code></td><td>管理员</td><td>创建用户组，可同时设置源站策略（<code>source_policy_mode</code> / <code>source_policy_list</code>）</td></tr>
        <tr><td>PUT</td><td><code>/groups/:id</code></td><td>管理员</td><td>修改名称、描述、源站策略；默认组（id=1）不可改名</td></tr>
        <tr><td>DELETE</td><td><code>/groups/:id</code></td><td>管理员</td><td>删除用户组；默认组不可删除，无组用户自动回落默认组，组授权记录一并清理</td></tr>
      </tbody>
    </table>

    <h2>渠道 <code>/api/channels</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/channels</code></td><td>登录</td><td>渠道列表：管理员返回全部（含授权记录），普通用户仅返回被授权的渠道；token/authtoken 掩码回显</td></tr>
        <tr><td>POST</td><td><code>/channels</code></td><td>管理员</td><td>创建渠道：frp 需 <code>config.serverAddr/serverPort</code>，ngrok 需 <code>config.authtoken</code>；可同时传 <code>access</code> 授权列表</td></tr>
        <tr><td>PUT</td><td><code>/channels/:id</code></td><td>管理员</td><td>修改名称、启用状态、config（掩码值 <code>********</code> 表示保留原值）、授权列表</td></tr>
        <tr><td>DELETE</td><td><code>/channels/:id</code></td><td>管理员</td><td>删除渠道：先停止其下运行中的隧道，一并删除隧道与授权记录</td></tr>
        <tr><td>POST</td><td><code>/channels/:id/check</code></td><td>管理员</td><td>检测对应二进制可用性（frp 执行 <code>frpc -v</code>，ngrok 执行 <code>ngrok version</code>），返回 <code>{ ok, version }</code> 或 <code>{ ok: false, error }</code></td></tr>
      </tbody>
    </table>

    <h2>隧道 <code>/api/tunnels</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/tunnels</code></td><td>登录</td><td>隧道列表：管理员返回全部，普通用户仅返回自己的</td></tr>
        <tr><td>POST</td><td><code>/tunnels</code></td><td>登录</td><td>创建隧道：校验渠道权限与源站策略；frp TCP 需 <code>remote_port</code>，frp HTTP/HTTPS 需 <code>subdomain</code> 或 <code>domain</code></td></tr>
        <tr><td>GET</td><td><code>/tunnels/:id</code></td><td>所有者</td><td>隧道详情（含渠道名、所有者名、状态、last_error、公网地址等）</td></tr>
        <tr><td>PUT</td><td><code>/tunnels/:id</code></td><td>所有者</td><td>修改隧道；running/starting 状态禁止修改，error 状态允许</td></tr>
        <tr><td>DELETE</td><td><code>/tunnels/:id</code></td><td>所有者</td><td>删除隧道（运行中先停止）</td></tr>
        <tr><td>POST</td><td><code>/tunnels/:id/start</code></td><td>所有者</td><td>启动隧道；启动前再次校验渠道权限与源站策略</td></tr>
        <tr><td>POST</td><td><code>/tunnels/:id/stop</code></td><td>所有者</td><td>停止隧道</td></tr>
        <tr><td>GET</td><td><code>/tunnels/:id/log</code></td><td>所有者</td><td>获取隧道进程日志末尾（<code>{ log }</code>）</td></tr>
        <tr><td>POST</td><td><code>/tunnels/:id/test/source</code></td><td>所有者</td><td>源站连通性测试（TCP 探测 + 时延）</td></tr>
        <tr><td>POST</td><td><code>/tunnels/:id/test/public</code></td><td>所有者</td><td>穿透后公网端连通性测试（含时延）</td></tr>
      </tbody>
    </table>

    <h2>设置 <code>/api/settings</code></h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>权限</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/settings</code></td><td>管理员</td><td>读取设置（<code>frpc_path</code>、<code>ngrok_path</code>）</td></tr>
        <tr><td>PUT</td><td><code>/settings</code></td><td>管理员</td><td>更新设置，仅接受白名单内的键</td></tr>
        <tr><td>POST</td><td><code>/settings/check</code></td><td>管理员</td><td>检测二进制可用性：传 <code>{ which: "frpc" | "ngrok", path? }</code>，path 优先用请求体中未保存的值，便于保存前测试</td></tr>
      </tbody>
    </table>
  </div>
</template>
