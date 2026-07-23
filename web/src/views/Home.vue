<template>
  <div class="home-page">
    <div class="hero">
      <div class="brand">Transout</div>
      <div class="slogan">内网穿透资源控制面板</div>
      <div class="sub">统一管理 frp / ngrok 穿透渠道与隧道，配合用户组权限与源站策略进行访问控制</div>
      <div class="hero-actions">
        <n-button type="primary" size="large" class="cta" @click="enter">
          {{ auth.token ? '进入控制台' : '登录控制台' }}
        </n-button>
        <n-button size="large" class="cta" @click="goDocs">查看文档</n-button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">功能特性</div>
      <div class="section-sub">从渠道接入到访问控制，覆盖内网穿透管理的完整链路</div>
      <div class="features">
        <n-card v-for="f in features" :key="f.title" class="feature-card">
          <div class="feature-title">{{ f.title }}</div>
          <div class="feature-desc">{{ f.desc }}</div>
        </n-card>
      </div>
    </div>

    <div class="section">
      <div class="section-title">工作流程</div>
      <div class="section-sub">四步把内网服务暴露到公网</div>
      <div class="steps">
        <div v-for="(s, i) in steps" :key="s.title" class="step">
          <div class="step-index">{{ i + 1 }}</div>
          <div class="step-title">{{ s.title }}</div>
          <div class="step-desc">{{ s.desc }}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">技术栈</div>
      <div class="section-sub">前后端分离的单仓库架构</div>
      <div class="stack">
        <n-tag v-for="t in stack" :key="t" size="large" round class="stack-tag">{{ t }}</n-tag>
      </div>
    </div>

    <div class="footer">© {{ year }} RunlingDev</div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const year = new Date().getFullYear()

const features = [
  { title: '多渠道穿透', desc: 'frp（frpc）与 ngrok 双类型渠道并存，token/authtoken 脱敏存储回显，一键检测二进制可用性' },
  { title: '隧道一键启停', desc: '配置源站与公网端后 Switch 直接启停，状态实时刷新，异常时展示 last_error' },
  { title: '连通性测试', desc: '源站与穿透后公网端双向连通性测试（含时延），运行日志随时查看' },
  { title: '用户组权限', desc: '用户可多组归属，渠道按用户组或用户授权，无授权记录默认拒绝' },
  { title: '源站黑白名单', desc: '不限制/白名单/黑名单三种模式，支持 IP、CIDR、通配域名与 host:port，多组并集/交集' },
  { title: '响应式界面', desc: '桌面与移动端自适应布局，明暗主题跟随系统，设计语言参照 Apple HIG' }
]

const steps = [
  { title: '配置渠道', desc: '管理员录入 frp 服务器或 ngrok authtoken，检测二进制可用性' },
  { title: '创建隧道', desc: '选择渠道与协议，填写内网源站地址和公网端配置' },
  { title: '启动穿透', desc: '一键启动，面板自动拉起 frpc / ngrok 进程' },
  { title: '验证访问', desc: '通过连通性测试与运行日志确认链路可用' }
]

const stack = ['Vue 3', 'Vite', 'Naive UI', 'Pinia', 'Vue Router', 'Express', 'better-sqlite3', 'frp', 'ngrok']

function enter() {
  router.push(auth.token ? '/console' : '/login')
}

function goDocs() {
  router.push('/docs')
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96px 24px 32px;
}
.hero {
  text-align: center;
  max-width: 640px;
}
.brand {
  font-size: 56px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.slogan {
  font-size: 22px;
  font-weight: 600;
  margin-top: 12px;
}
.sub {
  font-size: 14px;
  opacity: 0.6;
  margin-top: 12px;
  line-height: 1.8;
}
.hero-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
  flex-wrap: wrap;
}
.cta {
  padding: 0 40px;
}
.section {
  max-width: 960px;
  width: 100%;
  margin-top: 88px;
  text-align: center;
}
.section-title {
  font-size: 24px;
  font-weight: 700;
}
.section-sub {
  font-size: 14px;
  opacity: 0.6;
  margin-top: 8px;
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin-top: 32px;
  text-align: center;
}
.feature-title {
  font-size: 16px;
  font-weight: 600;
}
.feature-desc {
  font-size: 13px;
  opacity: 0.6;
  margin-top: 8px;
  line-height: 1.7;
}
.steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 32px;
}
.step {
  padding: 24px 16px;
  border-radius: 12px;
  border: 1px solid rgba(127, 127, 127, 0.2);
}
.step-index {
  width: 32px;
  height: 32px;
  margin: 0 auto;
  border-radius: 50%;
  background: #007aff;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-title {
  font-size: 15px;
  font-weight: 600;
  margin-top: 12px;
}
.step-desc {
  font-size: 13px;
  opacity: 0.6;
  margin-top: 8px;
  line-height: 1.7;
}
.stack {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}
.stack-tag {
  padding: 0 18px;
}
.footer {
  margin-top: auto;
  padding-top: 72px;
  font-size: 12px;
  opacity: 0.45;
}

@media (max-width: 768px) {
  .home-page {
    padding-top: 64px;
  }
  .brand {
    font-size: 40px;
  }
  .slogan {
    font-size: 18px;
  }
  .section {
    margin-top: 64px;
  }
  .section-title {
    font-size: 20px;
  }
}
</style>
