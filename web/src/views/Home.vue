<template>
  <div class="home-page">
    <div class="hero">
      <div class="brand">Transout</div>
      <div class="slogan">内网穿透资源控制面板</div>
      <div class="sub">统一管理 frp / ngrok 穿透渠道与隧道，配合用户组权限与源站策略进行访问控制</div>
      <n-button type="primary" size="large" class="cta" @click="enter">
        {{ auth.token ? '进入控制台' : '登录控制台' }}
      </n-button>
    </div>

    <div class="features">
      <n-card v-for="f in features" :key="f.title" class="feature-card">
        <div class="feature-title">{{ f.title }}</div>
        <div class="feature-desc">{{ f.desc }}</div>
      </n-card>
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
  { title: '穿透渠道', desc: 'frp 与 ngrok 双通道，多渠道并存，凭据脱敏存储' },
  { title: '隧道控制', desc: '一键启停、状态实时刷新、源站与公网端连通性测试' },
  { title: '权限体系', desc: '用户多组归属、渠道授权默认拒绝、源站黑白名单集合运算' }
]

function enter() {
  router.push(auth.token ? '/console' : '/login')
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
.cta {
  margin-top: 32px;
  padding: 0 40px;
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  max-width: 860px;
  width: 100%;
  margin-top: 72px;
}
.feature-card {
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
.footer {
  margin-top: auto;
  padding-top: 48px;
  font-size: 12px;
  opacity: 0.45;
}
</style>
