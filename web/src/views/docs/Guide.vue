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
    <h3>云安全组绑定</h3>
    <p>
      frp 渠道可在表单中绑定<strong>阿里云 ECS 或腾讯云 CVM 实例的安全组</strong>（可选），
      填写云厂商、地域 <code>regionId</code>、安全组 ID 与 AccessKey 凭据。
      <code>accessKeySecret</code> 与 token 一样脱敏回显（<code>********</code>），
      编辑时保持掩码或留空即保留原值。
    </p>
    <p>
      绑定后，frp <code>tcp</code> 隧道在<strong>创建与启动</strong>时自动向安全组放行
      <code>remote_port</code>（入方向 TCP / 指定端口 / <code>0.0.0.0/0</code> / 允许，幂等）；
      <strong>删除</strong>隧道时自动移除对应规则——若同渠道其他隧道仍占用该端口则保留。
      云 API 调用失败<strong>不阻断</strong>隧道操作：创建/启动照常成功，仅在响应中附带
      <code>cloud_warning</code> 说明原因（删除失败则仅记录服务端日志）。
      <code>http</code>/<code>https</code> 隧道与 ngrok 渠道不参与安全组联动。
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
    <h3>从 frpc 配置导入</h3>
    <p>
      隧道页的「导入」按钮支持直接粘贴 frpc 配置文件全文批量创建隧道，
      <code>ini</code>（<code>[common]</code> + 各隧道段）与 <code>toml</code>
      （<code>[[proxies]]</code>）两种格式自动识别，仅支持
      <code>tcp</code>/<code>http</code>/<code>https</code> 协议条目。
    </p>
    <ul>
      <li><strong>渠道匹配</strong>：按配置中的 <code>serverAddr</code> 精确匹配 frp 渠道，
        匹配不到时所有条目导入失败并注明原因；</li>
      <li><strong>逐条处理</strong>：每条隧道独立创建，响应中逐条返回成功（含隧道 ID）或失败原因，
        单条失败不影响其他条目；</li>
      <li><strong>同名去重</strong>：与当前用户已有隧道同名的条目会被跳过并提示「同名隧道已存在」；</li>
      <li><strong>字段映射</strong>：<code>local_ip/localIP → source_host</code>、
        <code>local_port → source_port</code>、<code>remote_port → remote_port</code>、
        <code>subdomain → subdomain</code>、<code>custom_domains 第一个值 → domain</code>，
        创建时同样会校验渠道权限与源站策略。</li>
    </ul>

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
