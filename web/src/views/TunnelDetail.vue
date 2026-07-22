<template>
  <div v-if="tunnel">
    <div class="page-head">
      <div class="head-text">
        <div class="title">
          <n-button text style="font-size: 24px; margin-right: 8px" @click="router.push({ name: 'tunnels' })">←</n-button>
          {{ tunnel.name }}
        </div>
        <div class="desc">隧道详情与连通性测试</div>
      </div>
      <n-switch
        :value="tunnel.status === 'running' || tunnel.status === 'starting'"
        @update:value="toggle"
      >
        <template #checked>运行中</template>
        <template #unchecked>已停止</template>
      </n-switch>
    </div>

    <n-alert v-if="tunnel.status === 'error' && tunnel.last_error" type="error" style="margin-bottom: 20px">
      {{ tunnel.last_error }}
    </n-alert>

    <n-card title="基本信息">
      <n-descriptions :column="2" label-placement="left" bordered>
        <n-descriptions-item label="渠道">{{ tunnel.channel_name }}（{{ tunnel.channel_type }}）</n-descriptions-item>
        <n-descriptions-item label="协议">{{ tunnel.proto.toUpperCase() }}</n-descriptions-item>
        <n-descriptions-item label="源站">{{ tunnel.source_host }}:{{ tunnel.source_port }}</n-descriptions-item>
        <n-descriptions-item label="状态">
          <StatusDot :status="tunnel.status" />
        </n-descriptions-item>
        <n-descriptions-item label="公网端" :span="2">
          <a v-if="publicLink" :href="publicLink" target="_blank" rel="noopener">{{ publicLink }}</a>
          <span v-else>{{ publicText }}</span>
        </n-descriptions-item>
        <n-descriptions-item label="所有者">{{ tunnel.owner_name }}</n-descriptions-item>
        <n-descriptions-item label="创建时间">{{ tunnel.created_at }}</n-descriptions-item>
      </n-descriptions>
    </n-card>

    <n-card title="连通性测试" style="margin-top: 20px">
      <n-space align="center">
        <n-button :loading="testing.source" @click="runTest('source')">源站测试</n-button>
        <n-button :loading="testing.public" @click="runTest('public')">穿透后测试</n-button>
      </n-space>
      <div class="test-results">
        <div v-if="results.source" class="test-item">
          <span class="test-label">源站 {{ tunnel.source_host }}:{{ tunnel.source_port }}</span>
          <n-tag :type="results.source.ok ? 'success' : 'error'" size="small" :bordered="false">
            {{ results.source.ok ? `可达 · ${results.source.latency_ms}ms` : `不可达 · ${results.source.error}` }}
          </n-tag>
        </div>
        <div v-if="results.public" class="test-item">
          <span class="test-label">公网端</span>
          <n-tag :type="results.public.ok ? 'success' : 'error'" size="small" :bordered="false">
            {{ results.public.ok
              ? `可达 · ${results.public.latency_ms}ms${results.public.detail ? ' · ' + results.public.detail : ''}`
              : `不可达 · ${results.public.error}` }}
          </n-tag>
        </div>
      </div>
    </n-card>

    <n-card style="margin-top: 20px">
      <template #header>运行日志（末尾）</template>
      <template #header-extra>
        <n-button size="small" quaternary :loading="loadingLog" @click="loadLog">刷新</n-button>
      </template>
      <pre class="log-view">{{ log || '暂无日志' }}</pre>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import api from '../api'
import StatusDot from '../components/StatusDot.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const tunnel = ref(null)
const channels = ref([])
const log = ref('')
const loadingLog = ref(false)
const testing = reactive({ source: false, public: false })
const results = reactive({ source: null, public: null })

const id = Number(route.params.id)

const channel = computed(() => channels.value.find((c) => c.id === tunnel.value?.channel_id))

const publicText = computed(() => {
  const t = tunnel.value
  if (!t) return '—'
  if (t.channel_type === 'ngrok') return t.public_url || t.domain || '（启动后自动获取）'
  if (t.proto === 'tcp') {
    const addr = channel.value?.config?.serverAddr
    return t.remote_port ? `${addr ? addr + ':' : ':'}${t.remote_port}` : '—'
  }
  return t.domain || t.subdomain || '—'
})

const publicLink = computed(() => {
  const t = tunnel.value
  if (!t) return null
  if (t.channel_type === 'ngrok' && t.public_url) return t.public_url
  if (t.channel_type === 'frp' && t.proto !== 'tcp') {
    const host = t.domain || t.subdomain
    return host ? `http://${host}` : null
  }
  return null
})

async function load(silent = false) {
  try {
    const [t, c] = await Promise.all([api.get(`/tunnels/${id}`), api.get('/channels')])
    tunnel.value = t
    channels.value = c
  } catch {
    if (!silent) router.push({ name: 'tunnels' })
  }
}

async function loadLog() {
  loadingLog.value = true
  try {
    const data = await api.get(`/tunnels/${id}/log`)
    log.value = data.log
  } catch {
    // 拦截器已提示
  } finally {
    loadingLog.value = false
  }
}

async function toggle(val) {
  try {
    await api.post(`/tunnels/${id}/${val ? 'start' : 'stop'}`)
    message.success(val ? '已启动' : '已停止')
  } catch {
    // 拦截器已提示
  }
  await load(true)
}

async function runTest(kind) {
  testing[kind] = true
  try {
    results[kind] = await api.post(`/tunnels/${id}/test/${kind}`)
  } catch {
    // 拦截器已提示
  } finally {
    testing[kind] = false
  }
}

let timer = null
onMounted(() => {
  load()
  loadLog()
  timer = setInterval(() => {
    if (!document.hidden) load(true)
  }, 3000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 20px;
}
.title {
  font-size: 24px;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.desc {
  font-size: 13px;
  opacity: 0.55;
  margin-top: 4px;
}
.test-results {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.test-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.test-label {
  font-size: 13px;
  opacity: 0.7;
}
.log-view {
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
