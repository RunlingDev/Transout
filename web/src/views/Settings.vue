<template>
  <div class="settings-page">
    <n-card title="系统设置" style="max-width: 520px" :loading="loading">
      <n-form label-placement="top">
        <n-form-item label="frpc 路径">
          <n-input v-model:value="form.frpc_path" placeholder="frpc 二进制路径" />
        </n-form-item>
        <n-form-item label="ngrok 路径">
          <n-input v-model:value="form.ngrok_path" placeholder="ngrok 二进制路径" />
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
</style>
