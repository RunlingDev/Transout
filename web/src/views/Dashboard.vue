<template>
  <div>
    <n-grid :cols="4" :x-gap="20" :y-gap="20" responsive="screen" item-responsive>
      <n-gi span="4 m:1">
        <n-card>
          <n-statistic label="隧道总数" :value="tunnels.length" />
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card>
          <n-statistic label="运行中">
            <span style="color: #34c759">{{ runningCount }}</span>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card>
          <n-statistic label="异常">
            <span :style="{ color: errorCount ? '#FF3B30' : 'inherit' }">{{ errorCount }}</span>
          </n-statistic>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card>
          <n-statistic label="可用渠道" :value="enabledChannels" />
        </n-card>
      </n-gi>
    </n-grid>

    <n-card title="隧道状态" style="margin-top: 20px">
      <n-data-table
        :columns="columns"
        :data="tunnels"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        size="small"
      />
    </n-card>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue'
import { NTag } from 'naive-ui'
import api from '../api'
import StatusDot from '../components/StatusDot.vue'

const tunnels = ref([])
const channels = ref([])
const loading = ref(false)

const runningCount = computed(() => tunnels.value.filter((t) => t.status === 'running').length)
const errorCount = computed(() => tunnels.value.filter((t) => t.status === 'error').length)
const enabledChannels = computed(() => channels.value.filter((c) => c.enabled).length)

const columns = [
  { title: '名称', key: 'name' },
  { title: '渠道', key: 'channel_name' },
  {
    title: '协议',
    key: 'proto',
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.proto.toUpperCase() })
  },
  {
    title: '源',
    key: 'source',
    render: (row) => `${row.source_host}:${row.source_port}`
  },
  {
    title: '状态',
    key: 'status',
    render: (row) => h(StatusDot, { status: row.status })
  }
]

onMounted(async () => {
  loading.value = true
  try {
    const [t, c] = await Promise.all([api.get('/tunnels'), api.get('/channels')])
    tunnels.value = t
    channels.value = c
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
})
</script>
