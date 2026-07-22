import { computed } from 'vue'
import { darkTheme, useOsTheme } from 'naive-ui'

const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif"

export function useAppTheme() {
  const osTheme = useOsTheme()
  const theme = computed(() => (osTheme.value === 'dark' ? darkTheme : null))

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

  return { theme, themeOverrides }
}
