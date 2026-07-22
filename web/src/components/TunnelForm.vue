<template>
  <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
    <n-form-item label="名称" path="name">
      <n-input v-model:value="form.name" placeholder="隧道名称" />
    </n-form-item>
    <n-form-item label="渠道" path="channel_id">
      <n-select
        v-model:value="form.channel_id"
        :options="channelOptions"
        placeholder="选择穿透渠道"
      />
    </n-form-item>
    <n-form-item label="协议" path="proto">
      <n-radio-group v-model:value="form.proto">
        <n-radio-button value="tcp">TCP</n-radio-button>
        <n-radio-button value="http">HTTP</n-radio-button>
        <n-radio-button value="https">HTTPS</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <n-grid :cols="2" :x-gap="16">
      <n-gi>
        <n-form-item label="源地址" path="source_host">
          <n-input v-model:value="form.source_host" placeholder="内网服务的地址" />
        </n-form-item>
      </n-gi>
      <n-gi>
        <n-form-item label="源端口" path="source_port">
          <n-input-number v-model:value="form.source_port" :min="0" :max="65535" style="width: 100%" />
        </n-form-item>
      </n-gi>
    </n-grid>
    <n-form-item v-if="form.proto === 'tcp'" label="远程端口" path="remote_port">
      <n-input-number v-model:value="form.remote_port" :min="0" :max="65535" style="width: 100%" />
    </n-form-item>
    <template v-else>
      <n-form-item label="子域名（可选）" path="subdomain">
        <n-input v-model:value="form.subdomain" placeholder="例如 myapp" />
      </n-form-item>
      <n-form-item label="域名（可选）" path="domain">
        <n-input v-model:value="form.domain" placeholder="例如 app.example.com" />
      </n-form-item>
    </template>
  </n-form>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  form: { type: Object, required: true },
  channels: { type: Array, default: () => [] }
})

const formRef = ref(null)

const channelOptions = computed(() =>
  props.channels.map((c) => ({ label: `${c.name}（${c.type}）`, value: c.id }))
)

const rules = {
  name: { required: true, message: '请输入名称', trigger: 'blur' },
  channel_id: { required: true, type: 'number', message: '请选择渠道', trigger: 'change' },
  source_host: { required: true, message: '请输入源地址', trigger: 'blur' },
  source_port: { required: true, type: 'number', message: '请输入源端口', trigger: 'change' }
}

function validate() {
  return formRef.value.validate()
}

defineExpose({ validate })
</script>
