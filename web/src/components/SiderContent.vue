<template>
  <div class="sider-content">
    <div class="brand">Transout</div>
    <n-menu :value="activeKey" :options="menuOptions" @update:value="onSelect" />
    <div class="sider-footer">
      <n-button class="theme-btn" quaternary size="small" block @click="cycleMode">
        <template #icon>
          <svg v-if="mode === 'light'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg v-else-if="mode === 'dark'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </template>
        {{ modeLabel }}
      </n-button>
      <div class="copyright">© {{ year }} RunlingDev</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppTheme } from '../theme'

defineProps({
  activeKey: { type: String, default: '' },
  menuOptions: { type: Array, default: () => [] }
})
const emit = defineEmits(['select'])

const { mode, setMode } = useAppTheme()
const year = new Date().getFullYear()

// 单按钮循环切换：浅色 -> 深色 -> 自动
const modes = ['light', 'dark', 'system']
const labels = { light: '浅色', dark: '深色', system: '自动' }
const modeLabel = computed(() => labels[mode.value] || '自动')

function cycleMode() {
  const i = modes.indexOf(mode.value)
  setMode(modes[(i + 1) % modes.length])
}

function onSelect(key) {
  emit('select', key)
}
</script>

<style scoped>
.sider-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.brand {
  padding: 22px 24px 14px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.sider-content .n-menu {
  flex: 1;
  overflow-y: auto;
}
.sider-footer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px;
  border-top: 1px solid rgba(128, 128, 128, 0.18);
}
.theme-btn {
  justify-content: center;
  opacity: 0.75;
}
.theme-btn:hover {
  opacity: 1;
}
.copyright {
  font-size: 12px;
  opacity: 0.45;
  padding-left: 4px;
}
</style>
