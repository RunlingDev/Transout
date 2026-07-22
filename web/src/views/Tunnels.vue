<template>
  <div>
    <div class="page-head">
      <div class="head-text">
        <div class="title">隧道</div>
        <div class="desc">管理内网穿透隧道</div>
      </div>
      <n-button type="primary" @click="openCreate">新建隧道</n-button>
    </div>

    <n-card>
      <n-data-table
        :columns="columns"
        :data="tunnels"
        :loading="loading"
        :row-key="(row) => row.id"
        :pagination="{ pageSize: 15 }"
      />
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑隧道' : '新建隧道'"
      style="width: 560px"
    >
      <TunnelForm ref="formRef" :form="form" :channels="channels" />
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="onSave">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NPopconfirm, NPopover, NSpace, NSwitch, NTag, NText, useDialog, useMessage } from 'naive-ui'
import api from '../api'
import StatusDot from '../components/StatusDot.vue'
import TunnelForm from '../components/TunnelForm.vue'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const tunnels = ref([])
const channels = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const formRef = ref(null)

const emptyForm = () => ({
  name: '',
  channel_id: null,
  proto: 'tcp',
  source_host: '127.0.0.1',
  source_port: null,
  remote_port: null,
  subdomain: '',
  domain: ''
})

const form = reactive(emptyForm())

const channelMap = computed(() => Object.fromEntries(channels.value.map((c) => [c.id, c])))

function publicEndpoint(row) {
  const ch = channelMap.value[row.channel_id]
  if (ch?.type === 'ngrok' || row.channel_type === 'ngrok') {
    return row.public_url || row.domain || '—'
  }
  if (row.proto === 'tcp') {
    const addr = ch?.config?.serverAddr
    if (!row.remote_port) return '—'
    return addr ? `${addr}:${row.remote_port}` : `:${row.remote_port}`
  }
  return row.domain || row.subdomain || '—'
}

async function toggleTunnel(row, val) {
  try {
    await api.post(`/tunnels/${row.id}/${val ? 'start' : 'stop'}`)
    message.success(val ? '已启动' : '已停止')
  } catch {
    // 拦截器已提示
  }
  await load()
}

const columns = [
  {
    title: '名称',
    key: 'name',
    render: (row) =>
      h(
        NButton,
        { text: true, type: 'primary', onClick: () => router.push({ name: 'tunnel-detail', params: { id: row.id } }) },
        { default: () => row.name }
      )
  },
  { title: '渠道', key: 'channel_name' },
  {
    title: '协议',
    key: 'proto',
    width: 80,
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.proto.toUpperCase() })
  },
  {
    title: '源',
    key: 'source',
    render: (row) => `${row.source_host}:${row.source_port}`
  },
  {
    title: '公网端',
    key: 'public',
    render: (row) => publicEndpoint(row)
  },
  {
    title: '状态',
    key: 'status',
    render: (row) =>
      h('div', null, [
        h(StatusDot, { status: row.status }),
        row.status === 'error' && row.last_error
          ? h(
              NPopover,
              { trigger: 'click', style: 'max-width: 360px' },
              {
                trigger: () =>
                  h(
                    NText,
                    { depth: 3, style: 'font-size: 12px; cursor: pointer; text-decoration: underline dotted; margin-left: 6px' },
                    { default: () => '查看错误' }
                  ),
                default: () => row.last_error
              }
            )
          : null
      ])
  },
  { title: '所有者', key: 'owner_name' },
  {
    title: '启用',
    key: 'enabled',
    width: 70,
    render: (row) =>
      h(NSwitch, {
        size: 'small',
        value: row.status === 'running' || row.status === 'starting',
        onUpdateValue: (val) => toggleTunnel(row, val)
      })
  },
  {
    title: '操作',
    key: 'actions',
    width: 140,
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => [
          h(
            NButton,
            { size: 'small', quaternary: true, onClick: () => openEdit(row) },
            { default: () => '编辑' }
          ),
          h(
            NPopconfirm,
            { onPositiveClick: () => onDelete(row) },
            {
              trigger: () =>
                h(NButton, { size: 'small', quaternary: true, type: 'error' }, { default: () => '删除' }),
              default: () => '确定删除该隧道？'
            }
          )
        ]
      })
  }
]

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const [t, c] = await Promise.all([api.get('/tunnels'), api.get('/channels')])
    tunnels.value = t
    channels.value = c
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 状态轮询：每 3 秒静默刷新一次，页面隐藏时暂停
let timer = null
onMounted(() => {
  load()
  timer = setInterval(() => {
    if (!document.hidden) load(true)
  }, 3000)
})
onUnmounted(() => clearInterval(timer))

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  showModal.value = true
}

function openEdit(row) {
  if (row.status === 'running' || row.status === 'starting') {
    dialog.warning({
      title: '隧道正在运行',
      content: '请先停止隧道，再进行编辑。',
      positiveText: '知道了'
    })
    return
  }
  editing.value = row
  Object.assign(form, {
    name: row.name,
    channel_id: row.channel_id,
    proto: row.proto,
    source_host: row.source_host,
    source_port: row.source_port,
    remote_port: row.remote_port ?? null,
    subdomain: row.subdomain || '',
    domain: row.domain || ''
  })
  showModal.value = true
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
    if (editing.value) {
      await api.put(`/tunnels/${editing.value.id}`, buildPayload())
    } else {
      await api.post('/tunnels', buildPayload())
    }
    message.success('已保存')
    showModal.value = false
    await load()
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  try {
    await api.delete(`/tunnels/${row.id}`)
    message.success('已删除')
    await load()
  } catch {
    // 拦截器已提示
  }
}
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
}
.desc {
  font-size: 13px;
  opacity: 0.55;
  margin-top: 4px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
