import { computed, ref, watch } from 'vue'
import { darkTheme, useOsTheme } from 'naive-ui'

const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"

const STORAGE_KEY = 'theme-mode'

// 'light' | 'dark' | 'system'，全局单例，默认跟随系统
const mode = ref(localStorage.getItem(STORAGE_KEY) || 'system')
let colorSchemeSynced = false

export function useAppTheme() {
  const osTheme = useOsTheme()

  const isDark = computed(() => {
    if (mode.value === 'system') return osTheme.value === 'dark'
    return mode.value === 'dark'
  })
  const theme = computed(() => (isDark.value ? darkTheme : null))

  // 同步原生控件/滚动条的配色方案（只挂一次监听）
  if (!colorSchemeSynced) {
    colorSchemeSynced = true
    watch(
      isDark,
      (dark) => {
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      },
      { immediate: true }
    )
  }

  function setMode(value) {
    mode.value = value
    localStorage.setItem(STORAGE_KEY, value)
  }

  function toggle() {
    setMode(isDark.value ? 'light' : 'dark')
  }

  const themeOverrides = {
    common: {
      primaryColor: '#007AFF',
      primaryColorHover: '#3395FF',
      primaryColorPressed: '#0062CC',
      primaryColorSuppl: '#007AFF',
      borderRadius: '8px',
      borderRadiusSmall: '6px',
      fontFamily
    },
    Card: {
      borderRadius: '12px'
    },
    Button: {
      borderRadiusMedium: '8px'
    },
    Input: {
      borderRadius: '8px'
    },
    DataTable: {
      borderRadius: '12px'
    },
    Dialog: {
      borderRadius: '12px'
    },
    Modal: {
      borderRadius: '12px'
    }
  }

  return { theme, themeOverrides, mode, isDark, setMode, toggle }
}
