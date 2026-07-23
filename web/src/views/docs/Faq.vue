<template>
  <div class="doc">
    <h1>常见问题</h1>

    <h2>frpc / ngrok 二进制缺失怎么办？</h2>
    <p>
      面板不自带穿透二进制。二进制缺失时，启动隧道会失败并进入「异常」状态，
      <code>last_error</code> 会明确提示「未找到 frpc/ngrok 二进制」，面板其余功能不受影响。处理方式：
    </p>
    <ol>
      <li>在服务器上安装对应的 <code>frpc</code> 或 <code>ngrok</code> 客户端；</li>
      <li>以管理员身份进入「设置」页，把 <code>frpc_path</code> / <code>ngrok_path</code>
        配成可执行文件的绝对路径（留空则从 PATH 查找）；</li>
      <li>用设置页或渠道表单的「检测」按钮确认二进制可用后，重新启动隧道。</li>
    </ol>

    <h2>隧道进入「异常」（error）状态怎么排查？</h2>
    <p>按以下顺序排查：</p>
    <ol>
      <li>看隧道列表/详情里的 <code>last_error</code>，它记录了进程退出原因；</li>
      <li>进隧道详情页查看运行日志（进程 stdout/stderr 的末尾部分），定位具体报错；</li>
      <li>常见原因：二进制缺失或路径错误、frp token 错误、ngrok authtoken 无效、
        <code>remote_port</code> 被占用、<code>subdomain</code>/<code>domain</code> 与 frps 配置不匹配；</li>
      <li>用「源站测试」确认内网源站本身可达；</li>
      <li>error 状态的隧道进程已退出，允许直接修改配置（渠道、源站、公网端等）后重新启动。</li>
    </ol>

    <h2>后端重启后，隧道会怎样？</h2>
    <p>
      面板对 frpc / ngrok 进程的登记保存在<strong>内存</strong>中，后端进程重启后这些登记全部丢失，
      无法再管理之前拉起的子进程。为避免状态错乱，后端启动时会把数据库里遗留的
      running/starting 状态统一清成 stopped。
      标记了<strong>开机自启</strong>的隧道会在此时被自动重新拉起（所属渠道需为启用状态），
      其余隧道需要手动重新启动。
      这也是生产环境建议用 systemd 托管后端（<code>Restart=on-failure</code>）并减少不必要重启的原因之一。
    </p>

    <h2>为什么操作一条 frp 隧道，同渠道的其他隧道会瞬断？</h2>
    <p>
      frp 渠道下<strong>所有启用的隧道共用一个 frpc 进程</strong>（一份 ini 配置里的多个段）。
      任何一条隧道的启动、停止或删除，都会杀掉当前 frpc 进程、重写整份渠道配置再重启，
      因此同渠道的其他隧道会出现短暂中断。这是设计上的取舍，规划隧道时可以把对稳定性要求高的服务
      分散到不同 frp 渠道，或改用 ngrok（每条隧道独立进程，互不影响）。
    </p>

    <h2>ngrok 隧道启动后为什么没有马上显示公网地址？</h2>
    <p>
      ngrok 的公网地址（<code>public_url</code>）由 ngrok 服务在隧道建立后分配，
      面板通过查询本地 ngrok agent 接口<strong>异步轮询</strong>回读并写入数据库。
      因此启动后的短时间内公网地址为空属于正常现象，稍等片刻刷新即可看到；
      若长时间为空，请查看隧道日志确认 ngrok 进程是否成功连接（如 authtoken 是否有效）。
    </p>
  </div>
</template>
