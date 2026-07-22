<template>
  <div class="access-editor">
    <div class="hint">留空表示所有用户可用；选择后仅所选用户组和用户可用。</div>
    <n-form-item label="用户组" label-placement="left" :label-width="64">
      <n-select
        v-model:value="selectedGroups"
        multiple
        clearable
        :options="groupOptions"
        placeholder="全部用户组"
        :loading="loading"
      />
    </n-form-item>
    <n-form-item label="用户" label-placement="left" :label-width="64">
      <n-select
        v-model:value="selectedUsers"
        multiple
        clearable
        :options="userOptions"
        placeholder="全部用户"
        :loading="loading"
      />
    </n-form-item>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../api'

const props = defineProps({
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const groups = ref([])
const users = ref([])
const loading = ref(false)

const groupOptions = computed(() => groups.value.map((g) => ({ label: g.name, value: g.id })))
const userOptions = computed(() => users.value.map((u) => ({ label: u.username, value: u.id })))

const selectedGroups = computed({
  get: () => props.modelValue.filter((a) => a.subject_type === 'group').map((a) => a.subject_id),
  set: (ids) => emitValue(ids, selectedUsers.value)
})

const selectedUsers = computed({
  get: () => props.modelValue.filter((a) => a.subject_type === 'user').map((a) => a.subject_id),
  set: (ids) => emitValue(selectedGroups.value, ids)
})

function emitValue(groupIds, userIds) {
  const access = [
    ...groupIds.map((id) => ({ subject_type: 'group', subject_id: id })),
    ...userIds.map((id) => ({ subject_type: 'user', subject_id: id }))
  ]
  emit('update:modelValue', access)
}

onMounted(async () => {
  loading.value = true
  try {
    const [g, u] = await Promise.all([api.get('/groups'), api.get('/users')])
    groups.value = g
    users.value = u
  } catch {
    // 错误消息已由拦截器提示
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.access-editor {
  width: 100%;
}
.hint {
  font-size: 12px;
  opacity: 0.6;
  margin-bottom: 10px;
}
</style>
