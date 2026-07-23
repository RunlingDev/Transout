<template>
  <div class="doc">
    <h1>介绍</h1>
    <p>
      Transout 是一个内网穿透资源控制面板，用于管理需要从内网穿透到公网的资源：
      统一配置 frp / ngrok 穿透渠道，在其上建立隧道并控制启停，
      配合用户组权限与源站黑白名单进行访问控制。
    </p>
    <p>
      项目为单仓库（monorepo）结构：前端 <code>web/</code> 使用 Vue3 + Vite + Naive UI + Pinia + Vue Router，
      后端 <code>server/</code> 使用 Node.js + Express + better-sqlite3，负责进程级管理 frpc / ngrok。
      数据全部落在 <code>server/data/</code>（SQLite 库、JWT 密钥、运行时配置、日志）。
    </p>

    <h2>核心概念</h2>

    <h3>渠道（Channel）</h3>
    <p>
      渠道是一条穿透链路的「入口配置」，代表一个可用的穿透服务：
    </p>
    <ul>
      <li><strong>frp 渠道</strong>：记录 frps 服务器地址（<code>serverAddr</code>）、端口（<code>serverPort</code>）与 token 等凭据；</li>
      <li><strong>ngrok 渠道</strong>：记录 ngrok 的 authtoken。</li>
    </ul>
    <p>
      渠道支持多条并存，token/authtoken 脱敏存储回显（GET 返回 <code>********</code>），
      并提供二进制可用性一键检测。渠道由管理员创建，按用户组或用户授权后普通用户才可见可用（默认拒绝）。
    </p>

    <h3>隧道（Tunnel）</h3>
    <p>
      隧道建立在渠道之上，把一台内网源站（<code>host:port</code>）映射到公网端。
      每条隧道包含：名称、所属渠道、协议（<code>tcp</code> / <code>http</code> / <code>https</code>）、
      源站地址与端口、公网端配置（frp 为 <code>remote_port</code> 或 <code>subdomain</code>/<code>domain</code>）。
      隧道支持一键启停、状态实时刷新、异常时展示 last_error、查看运行日志与连通性测试。
    </p>

    <h3>用户与用户组</h3>
    <p>
      管理员负责全局渠道、用户、用户组与全部隧道的管理。普通用户由管理员创建，可加入多个用户组；
      未分组用户归属内置的<strong>默认组</strong>（不可删除）。用户组是权限控制的载体：
      渠道授权按组（或按用户）发放，源站策略也按组配置。用户邮箱用于 Cravatar/Gravatar 头像。
    </p>

    <h3>源站策略</h3>
    <p>
      每个用户组可配置源站允许集合，限制组内用户能把哪些内网地址作为隧道源站：
      <strong>不限制</strong>（全集）、<strong>白名单</strong>（仅名单内允许）、<strong>黑名单</strong>（名单外允许）。
      条目支持 IP、IPv4 CIDR、<code>*.域名</code> 通配，均可带 <code>:端口</code>。
      用户属于多个组时，按用户设置对各组允许集合取<strong>并集</strong>（任一组允许即可）或<strong>交集</strong>（所有组都允许）。
    </p>

    <h2>frp 与 ngrok 的区别</h2>
    <table>
      <thead>
        <tr><th>维度</th><th>frp</th><th>ngrok</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>服务端</td>
          <td>自建 frps 服务器，渠道中配置地址与 token</td>
          <td>ngrok 官方 SaaS，渠道中配置 authtoken</td>
        </tr>
        <tr>
          <td>进程模型</td>
          <td>同一渠道下所有启用隧道<strong>共用一个 frpc 进程</strong>，任何隧道启停都会重写配置并重启该进程，同渠道其他隧道会瞬断</td>
          <td>每条启用隧道一个<strong>独立的 ngrok 进程</strong>，互不影响</td>
        </tr>
        <tr>
          <td>公网端</td>
          <td>TCP 隧道指定 <code>remote_port</code>；HTTP/HTTPS 隧道指定 <code>subdomain</code> 或 <code>domain</code></td>
          <td>由 ngrok 服务分配公网地址，面板启动后<strong>自动回读</strong>并展示（短暂延迟）</td>
        </tr>
        <tr>
          <td>二进制</td>
          <td>需要 <code>frpc</code> 客户端</td>
          <td>需要 <code>ngrok</code> 客户端（v3 配置格式）</td>
        </tr>
      </tbody>
    </table>
    <p>
      两种二进制路径都在「设置」页配置（<code>frpc_path</code> / <code>ngrok_path</code>，默认从 PATH 查找）。
      二进制缺失时隧道会进入「异常」状态并给出明确提示，不影响面板其余功能。
    </p>
  </div>
</template>
