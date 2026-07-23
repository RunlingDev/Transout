import { onMounted, onUnmounted, ref } from 'vue'

export function useIsMobile(breakpoint = 768) {
  const isMobile = ref(window.innerWidth <= breakpoint)

  function onResize() {
    isMobile.value = window.innerWidth <= breakpoint
  }

  onMounted(() => window.addEventListener('resize', onResize))
  onUnmounted(() => window.removeEventListener('resize', onResize))

  return isMobile
}
