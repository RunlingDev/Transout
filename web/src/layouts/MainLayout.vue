<template>
  <n-layout has-sider style="min-height: 100vh">
    <n-layout-sider
      bordered
      :width="220"
      :native-scrollbar="false"
      content-style="display: flex; flex-direction: column; height: 100vh;"
    >
      <div class="brand">Transout</div>
      <n-menu :value="activeKey" :options="menuOptions" @update:value="onSelect" />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="header">
        <div class="header-title">{{ pageTitle }}</div>
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
      <n-layout-footer bordered class="footer">© {{ year }} RunlingDev</n-layout-footer>
    </n-layout>
  </n-layout>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { avatarUrl } from '../utils/avatar'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const year = new Date().getFullYear()

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

function onUserSelect(key) {
  if (key === 'profile') {
    router.push({ name: 'profile' })
  } else if (key === 'logout') {
    auth.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.brand {
  padding: 22px 24px 14px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.header-title {
  font-size: 17px;
  font-weight: 600;
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
.footer {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0.45;
}
</style>
