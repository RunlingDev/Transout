<template>
  <n-modal
    :show="show"
    preset="card"
    title="从 frpc 配置导入"
    style="width: 640px"
    @update:show="onUpdateShow"
  >
    <div class="import-body">
      <n-input
        v-model:value="content"
        type="textarea"
        :rows="10"
        placeholder="粘贴 frpc 配置内容（支持 ini 与 toml 格式）"
      />
      <div class="file-row">
        <input
          ref="fileRef"
          type="file"
          accept=".ini,.toml"
          style="display: none"
          @change="onFileChange"
        />
        <n-button size="small" @click="fileRef.click()">选择本地文件（.ini / .toml）</n-button>
        <n-text v-if="fileName" depth="3" style="font-size: 12px">已读取：{{ fileName }}</n-text>
      </div>

      <template v-if="result">
        <n-alert :type="result.matched_channel ? 'success' : 'warning'" :show-icon="false">
          <template v-if="result.matched_channel">
            已匹配渠道：{{ result.matched_channel.name }}（ID: {{ result.matched_channel.id }}）
          </template>
          <template v-else>未匹配到 frp 渠道（按 serverAddr + server_port + token 核对），所有条目均导入失败</template>
        </n-alert>
        <ul class="result-list">
          <li v-for="(r, i) in result.results" :key="i" class="result-item">
            <n-tag :type="r.success ? 'success' : 'error'" size="small" :bordered="false">
              {{ r.success ? '成功' : '失败' }}
            </n-tag>
            <span class="result-name">{{ r.name }}</span>
            <n-text v-if="r.success" depth="3" style="font-size: 12px">隧道 ID: {{ r.tunnel_id }}</n-text>
            <n-text v-else type="error" style="font-size: 12px">{{ r.error }}</n-text>
          </li>
        </ul>
      </template>
    </div>
    <template #footer>
      <div class="modal-footer">
        <n-button @click="onUpdateShow(false)">关闭</n-button>
        <n-button type="primary" :loading="importing" :disabled="!content.trim()" @click="onImport">
          导入
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import api from '../api'

const props = defineProps({
  show: { type: Boolean, default: false }
})
const emit = defineEmits(['update:show', 'imported'])

const message = useMessage()
const content = ref('')
const fileName = ref('')
const fileRef = ref(null)
const importing = ref(false)
const result = ref(null)

function onUpdateShow(val) {
  emit('update:show', val)
  if (!val) {
    // 关闭时重置状态
    content.value = ''
    fileName.value = ''
    result.value = null
  }
}

function onFileChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    content.value = String(reader.result || '')
    fileName.value = file.name
  }
  reader.onerror = () => message.error('读取文件失败')
  reader.readAsText(file)
  e.target.value = '' // 允许重复选择同一文件
}

async function onImport() {
  importing.value = true
  try {
    const res = await api.post('/tunnels/import', { content: content.value })
    result.value = res
    const okCount = res.results.filter((r) => r.success).length
    if (okCount > 0) {
      message.success(`成功导入 ${okCount} 条隧道`)
      emit('imported')
    } else {
      message.warning('没有隧道被导入')
    }
  } catch {
    // 拦截器已提示
  } finally {
    importing.value = false
  }
}
</script>

<style scoped>
.import-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.result-name {
  font-weight: 600;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
