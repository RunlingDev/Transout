<template>
  <n-layout has-sider style="height: 100vh">
    <n-layout-sider
      v-if="!isMobile"
      bordered
      :width="220"
      :native-scrollbar="false"
      content-style="height: 100vh;"
    >
      <div class="docs-brand" @click="goHome">Transout 文档</div>
      <n-menu :value="activeKey" :options="menuOptions" @update:value="onSelect" />
    </n-layout-sider>
    <n-layout class="main-col">
      <n-layout-header bordered class="header">
        <div class="header-left">
          <n-button v-if="isMobile" quaternary class="menu-btn" aria-label="菜单" @click="drawerVisible = true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </n-button>
          <div class="header-title">{{ pageTitle }}</div>
        </div>
        <div class="header-actions">
          <n-button quaternary @click="goHome">返回首页</n-button>
          <n-button type="primary" @click="goConsole">
            {{ auth.token ? '控制台' : '登录' }}
          </n-button>
        </div>
      </n-layout-header>
      <n-layout-content class="content" :native-scrollbar="false">
        <div class="doc-wrap">
          <router-view />
        </div>
      </n-layout-content>
    </n-layout>

    <n-drawer v-model:show="drawerVisible" placement="left" :width="260">
      <n-drawer-content body-content-style="padding: 0; height: 100%;" closable>
        <div class="docs-brand" @click="goHome">Transout 文档</div>
        <n-menu :value="activeKey" :options="menuOptions" @update:value="onDrawerSelect" />
      </n-drawer-content>
    </n-drawer>
  </n-layout>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useIsMobile } from '../utils/responsive'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isMobile = useIsMobile()

const drawerVisible = ref(false)

// 路由变化时确保抽屉关闭
watch(
  () => route.fullPath,
  () => {
    drawerVisible.value = false
  }
)

const titles = {
  'doc-intro': '介绍',
  'doc-quickstart': '快速开始',
  'doc-deploy': '部署',
  'doc-guide': '使用指南',
  'doc-api': 'API 参考',
  'doc-faq': '常见问题'
}

const activeKey = computed(() => route.name)
const pageTitle = computed(() => titles[route.name] || '文档')

const menuOptions = [
  { label: '介绍', key: 'doc-intro' },
  { label: '快速开始', key: 'doc-quickstart' },
  { label: '部署', key: 'doc-deploy' },
  { label: '使用指南', key: 'doc-guide' },
  { label: 'API 参考', key: 'doc-api' },
  { label: '常见问题', key: 'doc-faq' }
]

function onSelect(key) {
  router.push({ name: key })
}

function onDrawerSelect(key) {
  drawerVisible.value = false
  onSelect(key)
}

function goHome() {
  router.push('/')
}

function goConsole() {
  router.push(auth.token ? '/console' : '/login')
}
</script>

<style scoped>
.docs-brand {
  font-size: 17px;
  font-weight: 700;
  padding: 18px 24px 12px;
  cursor: pointer;
}
.header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.header-title {
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.main-col {
  /* 高度锁死在视口内：header 固定，仅文档正文内部滚动 */
  height: 100%;
}
.content {
  flex: 1;
  min-height: 0;
  padding: 28px 32px;
}
.doc-wrap {
  max-width: 860px;
  margin: 0 auto;
}

@media (max-width: 768px) {
  .header {
    padding: 0 12px 0 8px;
  }
  .content {
    padding: 16px 12px;
  }
}
</style>

<!-- 文档正文排版样式：非 scoped，供各文档页的 .doc 容器共用 -->
<style>
.doc {
  font-size: 15px;
  line-height: 1.9;
  padding-bottom: 48px;
}
.doc h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.25);
}
.doc h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 36px 0 12px;
}
.doc h3 {
  font-size: 16px;
  font-weight: 600;
  margin: 24px 0 8px;
}
.doc p {
  margin: 12px 0;
}
.doc ul,
.doc ol {
  margin: 12px 0;
  padding-left: 24px;
}
.doc li {
  margin: 4px 0;
}
.doc a {
  color: #007aff;
  text-decoration: none;
}
.doc a:hover {
  text-decoration: underline;
}
.doc code {
  font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
  font-size: 0.88em;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.14);
}
.doc pre {
  margin: 12px 0;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.12);
  overflow-x: auto;
  line-height: 1.7;
}
.doc pre code {
  padding: 0;
  background: none;
  font-size: 13px;
}
.doc table {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
  font-size: 14px;
}
.doc th,
.doc td {
  padding: 8px 12px;
  border: 1px solid rgba(127, 127, 127, 0.25);
  text-align: left;
  vertical-align: top;
}
.doc th {
  font-weight: 600;
  background: rgba(127, 127, 127, 0.08);
}
.doc blockquote {
  margin: 12px 0;
  padding: 8px 16px;
  border-left: 3px solid #007aff;
  background: rgba(0, 122, 255, 0.06);
  border-radius: 0 8px 8px 0;
}
.doc blockquote p {
  margin: 4px 0;
}
</style>
