<template>
  <span class="status-dot">
    <span class="dot" :style="{ background: color }" />
    <span class="label" :style="{ color }">{{ text }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'stopped' }
})

const map = {
  running: { text: '运行中', color: '#34C759' },
  starting: { text: '启动中', color: '#FF9500' },
  stopped: { text: '已停止', color: '#8E8E93' },
  error: { text: '异常', color: '#FF3B30' }
}

const text = computed(() => map[props.status]?.text || props.status)
const color = computed(() => map[props.status]?.color || '#8E8E93')
</script>

<style scoped>
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.label {
  font-size: 13px;
}
</style>
