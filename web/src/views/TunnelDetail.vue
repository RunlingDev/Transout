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
      <n-space align="center">
        <n-space align="center" :size="6">
          <span class="auto-start-label">自启</span>
          <n-switch size="small" :value="!!tunnel.auto_start" @update:value="toggleAutoStart" />
        </n-space>
        <n-button size="small" @click="openEdit">编辑</n-button>
        <n-popconfirm @positive-click="onDelete">
          <template #trigger>
            <n-button size="small" quaternary type="error">删除</n-button>
          </template>
          确定删除该隧道？
        </n-popconfirm>
        <n-switch
          :value="tunnel.status === 'running' || tunnel.status === 'starting'"
          @update:value="toggle"
        >
          <template #checked>运行中</template>
          <template #unchecked>已停止</template>
        </n-switch>
      </n-space>
    </div>

    <n-modal v-model:show="showEdit" preset="card" title="编辑隧道" style="width: 560px">
      <TunnelForm ref="formRef" :form="form" :channels="channels" />
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showEdit = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="onSave">保存</n-button>
        </div>
      </template>
    </n-modal>

    <n-alert v-if="tunnel.status === 'error' && tunnel.last_error" type="error" style="margin-bottom: 20px">
      {{ tunnel.last_error }}
    </n-alert>

    <n-card title="基本信息">
      <n-descriptions :column="isMobile ? 1 : 2" label-placement="left" bordered>
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
import { useDialog, useMessage } from 'naive-ui'
import api from '../api'
import StatusDot from '../components/StatusDot.vue'
import TunnelForm from '../components/TunnelForm.vue'
import { useIsMobile } from '../utils/responsive'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const isMobile = useIsMobile()

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

// 开机自启开关：与隧道当前运行状态无关
async function toggleAutoStart(val) {
  try {
    await api.post(`/tunnels/${id}/auto-start`, { auto_start: val })
    message.success(val ? '将随服务启动自动拉起' : '已取消开机自启')
  } catch {
    // 拦截器已提示
  }
  await load(true)
}

// ---------- 编辑 / 删除 ----------
const showEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = reactive({
  name: '',
  channel_id: null,
  proto: 'tcp',
  source_host: '127.0.0.1',
  source_port: null,
  remote_port: null,
  subdomain: '',
  domain: ''
})

function openEdit() {
  const t = tunnel.value
  if (t.status === 'running' || t.status === 'starting') {
    dialog.warning({
      title: '隧道正在运行',
      content: '请先停止隧道，再进行编辑。',
      positiveText: '知道了'
    })
    return
  }
  Object.assign(form, {
    name: t.name,
    channel_id: t.channel_id,
    proto: t.proto,
    source_host: t.source_host,
    source_port: t.source_port,
    remote_port: t.remote_port ?? null,
    subdomain: t.subdomain || '',
    domain: t.domain || ''
  })
  showEdit.value = true
}

function buildPayload() {
  const payload = {
    name: form.name,
    channel_id: form.channel_id,
    proto: form.proto,
    source_host: form.source_host,
    source_port: form.source_port
  }
  if (form.proto === 'tcp') {
    if (form.remote_port != null) payload.remote_port = form.remote_port
  } else {
    if (form.subdomain) payload.subdomain = form.subdomain
    if (form.domain) payload.domain = form.domain
  }
  return payload
}

async function onSave() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await api.put(`/tunnels/${id}`, buildPayload())
    message.success('已保存')
    showEdit.value = false
    await load(true)
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  try {
    await api.delete(`/tunnels/${id}`)
    message.success('已删除')
    router.push({ name: 'tunnels' })
  } catch {
    // 拦截器已提示
  }
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
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.auto-start-label {
  font-size: 13px;
  opacity: 0.6;
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
