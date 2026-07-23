<template>
  <div>
    <div class="page-head">
      <div class="head-text">
        <div class="title">用户组</div>
        <div class="desc">分组权限与源站访问策略</div>
      </div>
      <n-button type="primary" @click="openCreate">新建用户组</n-button>
    </div>

    <ResponsiveTable
      :columns="columns"
      :data="groups"
      :loading="loading"
      :row-key="(row) => row.id"
      :pagination="{ pageSize: 15 }"
    />

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑用户组' : '新建用户组'"
      style="width: 520px"
    >
      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
        <n-form-item label="名称" path="name">
          <n-input v-model:value="form.name" placeholder="用户组名称" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="form.description" placeholder="可选" />
        </n-form-item>
        <n-form-item label="源站策略">
          <n-radio-group v-model:value="form.source_policy_mode">
            <n-radio-button value="none">不限制</n-radio-button>
            <n-radio-button value="whitelist">白名单</n-radio-button>
            <n-radio-button value="blacklist">黑名单</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item v-if="form.source_policy_mode !== 'none'" label="策略条目">
          <div class="policy-list">
            <div class="hint">支持 IP、CIDR、*.域名，可带 :端口，例如 192.168.1.0/24、*.example.com:8080</div>
            <n-dynamic-input
              v-model:value="form.source_policy_list"
              preset="input"
              placeholder="例如 10.0.0.0/8"
            />
          </div>
        </n-form-item>
      </n-form>
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
import { NButton, NPopconfirm, NSpace, NTag, useMessage } from 'naive-ui'
import api from '../api'
import ResponsiveTable from '../components/ResponsiveTable.vue'

const message = useMessage()

const groups = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const formRef = ref(null)

const form = reactive({
  name: '',
  description: '',
  source_policy_mode: 'none',
  source_policy_list: []
})

const rules = {
  name: { required: true, message: '请输入名称', trigger: 'blur' }
}

const modeText = { none: '不限制', whitelist: '白名单', blacklist: '黑名单' }
const modeType = { none: 'default', whitelist: 'success', blacklist: 'error' }

const columns = [
  { title: '名称', key: 'name' },
  { title: '描述', key: 'description', render: (row) => row.description || '—' },
  {
    title: '源站策略',
    key: 'source_policy_mode',
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: modeType[row.source_policy_mode] || 'default' },
        { default: () => modeText[row.source_policy_mode] || row.source_policy_mode }
      )
  },
  {
    title: '策略条目',
    key: 'source_policy_list',
    render: (row) => (row.source_policy_list?.length ? row.source_policy_list.join('、') : '—')
  },
  { title: '成员数', key: 'member_count', width: 80 },
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
              default: () => '确定删除该用户组？'
            }
          )
        ]
      })
  }
]

async function load() {
  loading.value = true
  try {
    groups.value = await api.get('/groups')
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    name: '',
    description: '',
    source_policy_mode: 'none',
    source_policy_list: []
  })
  showModal.value = true
}

function openEdit(row) {
  editing.value = row
  Object.assign(form, {
    name: row.name,
    description: row.description || '',
    source_policy_mode: row.source_policy_mode || 'none',
    source_policy_list: [...(row.source_policy_list || [])]
  })
  showModal.value = true
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
    description: form.description,
    source_policy_mode: form.source_policy_mode,
    source_policy_list:
      form.source_policy_mode === 'none'
        ? []
        : form.source_policy_list.filter((s) => s && s.trim())
  }
  try {
    if (editing.value) {
      await api.put(`/groups/${editing.value.id}`, payload)
    } else {
      await api.post('/groups', payload)
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
    await api.delete(`/groups/${row.id}`)
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
.policy-list {
  width: 100%;
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  margin-bottom: 8px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
