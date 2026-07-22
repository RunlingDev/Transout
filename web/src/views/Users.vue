<template>
  <div>
    <div class="page-head">
      <div class="head-text">
        <div class="title">用户</div>
        <div class="desc">管理面板账户</div>
      </div>
      <n-button type="primary" @click="openCreate">新建用户</n-button>
    </div>

    <n-card>
      <n-data-table
        :columns="columns"
        :data="users"
        :loading="loading"
        :row-key="(row) => row.id"
        :pagination="{ pageSize: 15 }"
      />
    </n-card>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑用户' : '新建用户'"
      style="width: 440px"
    >
      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
        <n-form-item label="用户名" path="username">
          <n-input v-model:value="form.username" :disabled="!!editing" placeholder="登录用户名" />
        </n-form-item>
        <n-form-item :label="editing ? '新密码（留空则不修改）' : '密码'" path="password">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="密码"
          />
        </n-form-item>
        <n-form-item label="邮箱（可选，用于头像）" path="email">
          <n-input v-model:value="form.email" placeholder="name@example.com" />
        </n-form-item>
        <n-form-item label="所属用户组（可多选）" path="group_ids">
          <n-select
            v-model:value="form.group_ids"
            :options="groupOptions"
            multiple
            placeholder="默认组"
          />
        </n-form-item>
        <n-form-item label="多组冲突策略">
          <div class="combine-field">
            <n-radio-group v-model:value="form.source_policy_combine">
              <n-radio-button value="union">并集</n-radio-button>
              <n-radio-button value="intersection">交集</n-radio-button>
            </n-radio-group>
            <div class="hint">属于多个组时生效。对于指定的源站，并集策略指任一组允许即可使用；交集策略指需所有组都允许才可使用</div>
          </div>
        </n-form-item>
        <n-form-item label="管理员">
          <n-switch v-model:value="form.is_admin" />
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
import { computed, h, onMounted, reactive, ref } from 'vue'
import { NButton, NPopconfirm, NSpace, NTag, useMessage } from 'naive-ui'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const message = useMessage()
const auth = useAuthStore()

const users = ref([])
const groups = ref([])
const loading = ref(false)
const saving = ref(false)
const showModal = ref(false)
const editing = ref(null)
const formRef = ref(null)

const form = reactive({ username: '', password: '', email: '', is_admin: false, group_ids: [], source_policy_combine: 'union' })

const groupOptions = computed(() => groups.value.map((g) => ({ label: g.name, value: g.id })))

const rules = {
  username: { required: true, message: '请输入用户名', trigger: 'blur' },
  password: {
    validator: (rule, value) => {
      if (!editing.value && !value) return new Error('请输入密码')
      return true
    },
    trigger: 'blur'
  },
  email: {
    validator: (rule, value) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return new Error('邮箱格式不正确')
      return true
    },
    trigger: 'blur'
  }
}

const columns = [
  { title: '用户名', key: 'username' },
  { title: '邮箱', key: 'email', render: (row) => row.email || '—' },
  {
    title: '角色',
    key: 'is_admin',
    width: 100,
    render: (row) =>
      row.is_admin
        ? h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => '管理员' })
        : h(NTag, { size: 'small', bordered: false }, { default: () => '普通用户' })
  },
  {
    title: '用户组',
    key: 'groups',
    render: (row) =>
      row.groups?.length
        ? h(NSpace, { size: 4 }, {
            default: () =>
              row.groups.map((g) =>
                h(NTag, { size: 'small', bordered: false }, { default: () => g.name })
              )
          })
        : '—'
  },
  {
    title: '多组冲突',
    key: 'source_policy_combine',
    width: 100,
    render: (row) => (row.source_policy_combine === 'intersection' ? '交集' : '并集')
  },
  { title: '创建时间', key: 'created_at', render: (row) => formatTime(row.created_at) },
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
                h(
                  NButton,
                  { size: 'small', quaternary: true, type: 'error', disabled: row.id === auth.user?.id },
                  { default: () => '删除' }
                ),
              default: () => '确定删除该用户？'
            }
          )
        ]
      })
  }
]

function formatTime(t) {
  if (!t) return '—'
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? String(t) : d.toLocaleString('zh-CN')
}

async function load() {
  loading.value = true
  try {
    const [u, g] = await Promise.all([api.get('/users'), api.get('/groups')])
    users.value = u
    groups.value = g
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  Object.assign(form, { username: '', password: '', email: '', is_admin: false, group_ids: [], source_policy_combine: 'union' })
  showModal.value = true
}

function openEdit(row) {
  editing.value = row
  Object.assign(form, {
    username: row.username,
    password: '',
    email: row.email || '',
    is_admin: row.is_admin,
    group_ids: (row.groups || []).map((g) => g.id),
    source_policy_combine: row.source_policy_combine || 'union'
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
  try {
    if (editing.value) {
      const payload = {
        is_admin: form.is_admin,
        email: form.email,
        group_ids: form.group_ids,
        source_policy_combine: form.source_policy_combine
      }
      if (form.password) payload.password = form.password
      await api.put(`/users/${editing.value.id}`, payload)
    } else {
      await api.post('/users', {
        username: form.username,
        password: form.password,
        email: form.email,
        is_admin: form.is_admin,
        group_ids: form.group_ids,
        source_policy_combine: form.source_policy_combine
      })
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
    await api.delete(`/users/${row.id}`)
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
.combine-field {
  width: 100%;
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  margin-top: 6px;
}
</style>
