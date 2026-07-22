<template>
  <div class="settings-page">
    <n-card title="系统设置" style="max-width: 560px" :loading="loading">
      <n-form label-placement="top">
        <n-form-item v-for="item in binaries" :key="item.key" :label="item.label">
          <div class="bin-row">
            <n-input v-model:value="form[item.key]" :placeholder="`${item.name} 二进制路径`" />
            <n-button :loading="item.testing" @click="onTest(item)">测试</n-button>
          </div>
          <div v-if="item.result" class="bin-result">
            <n-tag :type="item.result.ok ? 'success' : 'error'" size="small" :bordered="false">
              {{ item.result.ok ? `可用 · ${item.result.version}` : item.result.error }}
            </n-tag>
          </div>
        </n-form-item>
        <n-button type="primary" :loading="saving" @click="onSave">保存</n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import api from '../api'

const message = useMessage()

const loading = ref(false)
const saving = ref(false)
const form = reactive({ frpc_path: '', ngrok_path: '' })

// 各二进制的测试状态（不随表单提交）
const binaries = reactive([
  { key: 'frpc_path', name: 'frpc', label: 'frpc 路径', testing: false, result: null },
  { key: 'ngrok_path', name: 'ngrok', label: 'ngrok 路径', testing: false, result: null }
])

onMounted(async () => {
  loading.value = true
  try {
    const data = await api.get('/settings')
    form.frpc_path = data.frpc_path || ''
    form.ngrok_path = data.ngrok_path || ''
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
})

async function onTest(item) {
  item.testing = true
  item.result = null
  try {
    item.result = await api.post('/settings/check', { which: item.name, path: form[item.key] })
  } catch {
    // 拦截器已提示
  } finally {
    item.testing = false
  }
}

async function onSave() {
  saving.value = true
  try {
    await api.put('/settings', { frpc_path: form.frpc_path, ngrok_path: form.ngrok_path })
    message.success('已保存')
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.settings-page {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}
.bin-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.bin-row .n-input {
  flex: 1;
}
.bin-result {
  margin-top: 6px;
}
</style>
