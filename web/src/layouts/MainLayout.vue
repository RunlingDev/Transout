<template>
  <n-layout has-sider style="min-height: 100vh">
    <n-layout-sider
      v-if="!isMobile"
      bordered
      :width="siderWidth"
      :native-scrollbar="false"
      content-style="height: 100vh;"
      class="sider"
    >
      <SiderContent :active-key="activeKey" :menu-options="menuOptions" @select="onSelect" />
      <div class="sider-resizer" @mousedown="startResize" />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="header">
        <div class="header-left">
          <n-button v-if="isMobile" quaternary class="menu-btn" aria-label="菜单" @click="drawerVisible = true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </n-button>
          <div class="header-title">{{ pageTitle }}</div>
        </div>
        <n-dropdown :options="userOptions" @select="onUserSelect" trigger="click">
          <div class="user-chip">
            <n-avatar round size="small" :src="avatarUrl(auth.user?.email, 64)">{{ avatarText }}</n-avatar>
            <span class="username">{{ auth.user?.username }}</span>
            <n-tag v-if="auth.isAdmin" size="tiny" type="info">管理员</n-tag>
          </div>
        </n-dropdown>
      </n-layout-header>
      <n-layout-content class="content" :native-scrollbar="false">
        <router-view />
      </n-layout-content>
    </n-layout>

    <n-drawer v-model:show="drawerVisible" placement="left" :width="260">
      <n-drawer-content body-content-style="padding: 0; height: 100%;" closable>
        <SiderContent :active-key="activeKey" :menu-options="menuOptions" @select="onDrawerSelect" />
      </n-drawer-content>
    </n-drawer>
  </n-layout>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { avatarUrl } from '../utils/avatar'
import { useIsMobile } from '../utils/responsive'
import SiderContent from '../components/SiderContent.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const isMobile = useIsMobile()

const SIDER_WIDTH_KEY = 'sider-width'
const SIDER_MIN = 180
const SIDER_MAX = 400

const savedWidth = Number(localStorage.getItem(SIDER_WIDTH_KEY))
const siderWidth = ref(
  Number.isFinite(savedWidth) && savedWidth
    ? Math.min(SIDER_MAX, Math.max(SIDER_MIN, savedWidth))
    : 220
)
const drawerVisible = ref(false)

// 路由变化时确保抽屉关闭
watch(
  () => route.fullPath,
  () => {
    drawerVisible.value = false
  }
)

const titles = {
  dashboard: '仪表盘',
  tunnels: '隧道',
  'tunnel-detail': '隧道详情',
  channels: '渠道',
  users: '用户',
  groups: '用户组',
  settings: '设置',
  profile: '个人资料'
}

const activeKey = computed(() => route.name)
const pageTitle = computed(() => titles[route.name] || '')

const menuOptions = computed(() => {
  const items = [
    { label: '仪表盘', key: 'dashboard' },
    { label: '隧道', key: 'tunnels' }
  ]
  if (auth.isAdmin) {
    items.push(
      { label: '渠道', key: 'channels' },
      { label: '用户', key: 'users' },
      { label: '用户组', key: 'groups' },
      { label: '设置', key: 'settings' }
    )
  }
  return items
})

const userOptions = [
  { label: '修改密码', key: 'profile' },
  { type: 'divider', key: 'd1' },
  { label: '退出登录', key: 'logout' }
]

const avatarText = computed(() => (auth.user?.username || '?').slice(0, 1).toUpperCase())

function onSelect(key) {
  router.push({ name: key })
}

function onDrawerSelect(key) {
  drawerVisible.value = false
  onSelect(key)
}

function onUserSelect(key) {
  if (key === 'profile') {
    router.push({ name: 'profile' })
  } else if (key === 'logout') {
    auth.logout()
    router.push('/login')
  }
}

function startResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startWidth = siderWidth.value

  function onMove(ev) {
    siderWidth.value = Math.min(SIDER_MAX, Math.max(SIDER_MIN, Math.round(startWidth + ev.clientX - startX)))
  }
  function onUp() {
    localStorage.setItem(SIDER_WIDTH_KEY, String(siderWidth.value))
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.classList.remove('rt-resizing')
  }
  document.body.classList.add('rt-resizing')
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.sider {
  position: relative;
}
.sider-resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 10;
  transition: background 0.15s;
}
.sider-resizer:hover,
body.rt-resizing .sider-resizer {
  background: rgba(0, 122, 255, 0.25);
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
.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
}
.username {
  font-size: 14px;
}
.content {
  padding: 28px 32px;
}

@media (max-width: 768px) {
  .header {
    padding: 0 12px 0 8px;
  }
  .content {
    padding: 16px 12px;
  }
}

@media (max-width: 480px) {
  .username {
    display: none;
  }
}
</style>
