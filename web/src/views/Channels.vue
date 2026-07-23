<template>
  <div>
    <div class="page-head">
      <div class="head-text">
        <div class="title">渠道</div>
        <div class="desc">管理 frp / ngrok 穿透渠道</div>
      </div>
      <n-button type="primary" @click="openCreate">新建渠道</n-button>
    </div>

    <ResponsiveTable
      :columns="columns"
      :data="channels"
      :loading="loading"
      :row-key="(row) => row.id"
      :pagination="{ pageSize: 15 }"
    />

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑渠道' : '新建渠道'"
      style="width: 560px"
    >
      <ChannelForm ref="formRef" :form="form" :is-admin="auth.isAdmin" />
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
import { h, onMounted, reactive, ref } from 'vue'
import { NButton, NPopconfirm, NSpace, NSwitch, NTag, useMessage } from 'naive-ui'
import api from '../api'
import ChannelForm from '../components/ChannelForm.vue'
import ResponsiveTable from '../components/ResponsiveTable.vue'
import { useAuthStore } from '../stores/auth'

const message = useMessage()
const auth = useAuthStore()

const channels = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const formRef = ref(null)
const checkingId = ref(null)

const emptyForm = () => ({
  name: '',
  type: 'frp',
  config: { serverAddr: '', serverPort: 7000, token: '', authtoken: '', region: '' },
  enabled: true,
  access: []
})

const form = reactive(emptyForm())

function configSummary(row) {
  if (row.type === 'frp') {
    const c = row.config || {}
    return c.serverAddr ? `${c.serverAddr}:${c.serverPort || ''}` : '—'
  }
  const c = row.config || {}
  return c.region ? `区域 ${c.region}` : '—'
}

async function toggleEnabled(row, val) {
  try {
    await api.put(`/channels/${row.id}`, {
      name: row.name,
      type: row.type,
      config: row.config,
      enabled: val,
      access: row.access || []
    })
    message.success(val ? '已启用' : '已停用')
  } catch {
    // 拦截器已提示
  }
  await load()
}

async function onCheck(row) {
  checkingId.value = row.id
  try {
    const res = await api.post(`/channels/${row.id}/check`)
    if (res.ok) {
      message.success(res.version ? `可用：${res.version}` : '二进制可用')
    } else {
      message.error(res.error || '检测失败')
    }
  } catch {
    // 拦截器已提示
  } finally {
    checkingId.value = null
  }
}

const columns = [
  { title: '名称', key: 'name' },
  {
    title: '类型',
    key: 'type',
    width: 90,
    render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => row.type })
  },
  { title: '配置', key: 'config', render: (row) => configSummary(row) },
  {
    title: '授权',
    key: 'access',
    render: (row) => (row.access && row.access.length ? `${row.access.length} 个对象` : '全员可用')
  },
  {
    title: '启用',
    key: 'enabled',
    width: 70,
    render: (row) =>
      h(NSwitch, {
        size: 'small',
        value: row.enabled,
        onUpdateValue: (val) => toggleEnabled(row, val)
      })
  },
  {
    title: '操作',
    key: 'actions',
    width: 220,
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              quaternary: true,
              loading: checkingId.value === row.id,
              onClick: () => onCheck(row)
            },
            { default: () => '检测' }
          ),
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
              default: () => '确定删除该渠道？关联隧道将无法启动。'
            }
          )
        ]
      })
  }
]

async function load() {
  loading.value = true
  try {
    channels.value = await api.get('/channels')
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, emptyForm())
  showModal.value = true
}

function openEdit(row) {
  editing.value = row
  Object.assign(form, {
    name: row.name,
    type: row.type,
    config: {
      serverAddr: row.config?.serverAddr || '',
      serverPort: row.config?.serverPort ?? 7000,
      token: row.config?.token ?? '',
      authtoken: row.config?.authtoken ?? '',
      region: row.config?.region || ''
    },
    enabled: row.enabled,
    access: row.access || []
  })
  showModal.value = true
}

function buildConfig() {
  if (form.type === 'frp') {
    return {
      serverAddr: form.config.serverAddr,
      serverPort: form.config.serverPort,
      token: form.config.token || ''
    }
  }
  return {
    authtoken: form.config.authtoken || '',
    region: form.config.region || ''
  }
}

async function onSave() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  const payload = {
    name: form.name,
    type: form.type,
    config: buildConfig(),
    enabled: form.enabled,
    access: form.access
  }
  try {
    if (editing.value) {
      await api.put(`/channels/${editing.value.id}`, payload)
    } else {
      await api.post('/channels', payload)
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
    await api.delete(`/channels/${row.id}`)
    message.success('已删除')
    await load()
  } catch {
    // 拦截器已提示
  }
}

onMounted(load)
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
