<template>
  <div class="doc">
    <h1>使用指南</h1>
    <p>本页按模块说明控制台的日常使用：渠道、隧道、用户与用户组、源站策略。</p>

    <h2>渠道管理（管理员）</h2>
    <p>渠道是穿透链路的入口配置，在「渠道」页管理，支持 frp 与 ngrok 两种类型：</p>
    <ul>
      <li><strong>frp 渠道</strong>：必填 <code>serverAddr</code>（frps 服务器地址）与 <code>serverPort</code>，token 等凭据按需填写；</li>
      <li><strong>ngrok 渠道</strong>：必填 <code>authtoken</code>。</li>
    </ul>
    <h3>凭据脱敏</h3>
    <p>
      token / authtoken 在接口返回中一律以 <code>********</code> 掩码回显，不回传明文。
      编辑渠道时该字段保持 <code>********</code> 即表示<strong>保留原值</strong>；输入新值才会覆盖。
    </p>
    <h3>二进制检测</h3>
    <p>
      渠道表单提供「检测」按钮，用配置的二进制路径执行版本命令
      （frp 为 <code>frpc -v</code>，ngrok 为 <code>ngrok version</code>）验证可用性并展示版本。
      找不到二进制时会提示在设置中配置路径。
    </p>
    <h3>授权与删除</h3>
    <p>
      渠道可配置授权列表（见下文「渠道授权」）。删除渠道会先停止其下运行中的隧道，
      并一并删除隧道与授权记录，不可恢复。
    </p>

    <h2>隧道管理</h2>
    <p>隧道在「隧道」页创建与管理。每条隧道包含：</p>
    <ul>
      <li><strong>名称与渠道</strong>：只能选用自己有权限且已启用的渠道；</li>
      <li><strong>协议</strong>：<code>tcp</code> / <code>http</code> / <code>https</code>；</li>
      <li><strong>源站</strong>：内网服务的 <code>host</code> 与 <code>port</code>，创建与启动时都会按源站策略校验；</li>
      <li><strong>公网端</strong>：frp TCP 隧道需指定 <code>remote_port</code>；frp HTTP/HTTPS 隧道需指定
        <code>subdomain</code> 或 <code>domain</code>；ngrok 无需填写，公网地址启动后由服务分配并自动回读展示。</li>
    </ul>
    <h3>启停与状态</h3>
    <p>
      列表页的 Switch 直接启停隧道，状态实时刷新。状态流转为
      <code>stopped → starting → running</code>；启动失败或进程异常退出时进入「异常」状态，
      并展示 <code>last_error</code> 说明原因。
    </p>
    <blockquote>
      <p>
        运行中（running）与启动中（starting）的隧道禁止修改配置，需先停止；
        异常（error）状态的隧道进程已退出，允许直接修改后重新启动。
      </p>
    </blockquote>
    <h3>日志与连通性测试</h3>
    <p>
      隧道详情页提供运行日志（进程输出的末尾部分）与两项测试：
      <strong>源站测试</strong>对源站 <code>host:port</code> 做 TCP 探测，
      <strong>公网测试</strong>探测穿透后的公网端，两者均返回连通结果与时延。
    </p>

    <h2>用户与用户组（管理员）</h2>
    <ul>
      <li><strong>用户</strong>：管理员创建（用户名 + 至少 6 位密码），可设置邮箱（用于 Cravatar/Gravatar 头像）、
        管理员标记与所属用户组。不能删除自己，也不能把自己降为非管理员；</li>
      <li><strong>默认组</strong>：内置组（id=1），是未分组用户的归属，不可删除、不可改名。
        创建用户时不指定组则自动归入默认组；</li>
      <li><strong>多组归属</strong>：一个用户可加入多个用户组，源站策略按用户的
        <code>source_policy_combine</code> 设置（并集/交集）聚合各组；</li>
      <li><strong>删除用户组</strong>：成员中不再属于任何组的用户自动回落到默认组，
        该组的渠道授权记录一并清理。</li>
    </ul>
    <h3>渠道授权（默认拒绝）</h3>
    <p>
      渠道授权按<strong>用户组</strong>或<strong>用户</strong>发放，在渠道表单中配置。
      <strong>没有任何授权记录的渠道仅管理员可见可用</strong>（默认拒绝）；
      一旦添加授权，只有被授权的组成员/用户能使用。创建与启动隧道时都会校验渠道权限。
    </p>

    <h2>源站策略</h2>
    <p>每个用户组定义一个源站「允许集合」，三种模式：</p>
    <table>
      <thead>
        <tr><th>模式</th><th>含义</th></tr>
      </thead>
      <tbody>
        <tr><td><code>none</code>（不限制）</td><td>允许集合为全集，任何源站都放行</td></tr>
        <tr><td><code>whitelist</code>（白名单）</td><td>允许集合为名单本身，仅名单内源站放行</td></tr>
        <tr><td><code>blacklist</code>（黑名单）</td><td>允许集合为名单的补集，名单外源站放行</td></tr>
      </tbody>
    </table>
    <h3>条目格式</h3>
    <ul>
      <li>主机名或 IP：<code>192.168.1.10</code>、<code>nas.local</code>；</li>
      <li>带端口：<code>192.168.1.10:22</code>、<code>nas.local:8080</code>（仅匹配该端口）；</li>
      <li>IPv4 CIDR：<code>10.0.0.0/8</code>、<code>192.168.0.0/16</code>；</li>
      <li>通配域名：<code>*.example.com</code>（同时匹配 <code>example.com</code> 与其各级子域名）。</li>
    </ul>
    <h3>多组聚合</h3>
    <p>
      用户属于多个组时，按用户的 <code>source_policy_combine</code> 设置聚合各组的允许集合：
    </p>
    <ul>
      <li><code>union</code>（并集，默认）：任一组允许即可；</li>
      <li><code>intersection</code>（交集）：所有组都允许才行。</li>
    </ul>
    <p>
      策略在创建/修改隧道与启动隧道时都会校验，不通过时返回具体原因
      （例如「源站 10.0.0.5:22 不被任何所在组允许」）。用户不属于任何组时禁止所有源站。
    </p>
  </div>
</template>
