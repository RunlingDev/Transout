<template>
  <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
    <n-form-item label="名称" path="name">
      <n-input v-model:value="form.name" placeholder="渠道名称" />
    </n-form-item>
    <n-form-item label="类型" path="type">
      <n-radio-group v-model:value="form.type">
        <n-radio-button value="frp">frp</n-radio-button>
        <n-radio-button value="ngrok">ngrok</n-radio-button>
      </n-radio-group>
    </n-form-item>
    <template v-if="form.type === 'frp'">
      <n-grid :cols="2" :x-gap="16">
        <n-gi>
          <n-form-item label="服务器地址" :path="form.type === 'frp' ? 'config.serverAddr' : undefined">
            <n-input v-model:value="form.config.serverAddr" placeholder="frps 地址" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="服务器端口">
            <n-input-number v-model:value="form.config.serverPort" :min="1" :max="65535" style="width: 100%" />
          </n-form-item>
        </n-gi>
      </n-grid>
      <n-form-item label="Token">
        <n-input
          v-model:value="form.config.token"
          type="password"
          show-password-on="click"
          placeholder="留空表示无；******** 表示不修改"
        />
      </n-form-item>
      <n-collapse v-if="form.cloud" style="margin-bottom: 12px">
        <n-collapse-item title="云安全组绑定（可选）" name="cloud">
          <n-form-item label="云厂商">
            <n-radio-group v-model:value="form.cloud.provider">
              <n-radio-button value="">不绑定</n-radio-button>
              <n-radio-button value="aliyun">阿里云</n-radio-button>
              <n-radio-button value="tencent">腾讯云</n-radio-button>
            </n-radio-group>
          </n-form-item>
          <template v-if="form.cloud.provider">
            <n-grid :cols="2" :x-gap="16">
              <n-gi>
                <n-form-item label="地域 regionId">
                  <n-input v-model:value="form.cloud.regionId" placeholder="如 cn-hangzhou / ap-guangzhou" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="实例 ID（仅记录展示）">
                  <n-input v-model:value="form.cloud.instanceId" placeholder="i-xxx" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="安全组 ID">
                  <n-input v-model:value="form.cloud.securityGroupId" placeholder="sg-xxx" />
                </n-form-item>
              </n-gi>
              <n-gi>
                <n-form-item label="AccessKey ID">
                  <n-input v-model:value="form.cloud.accessKeyId" />
                </n-form-item>
              </n-gi>
            </n-grid>
            <n-form-item label="AccessKey Secret">
              <n-input
                v-model:value="form.cloud.accessKeySecret"
                type="password"
                show-password-on="click"
                placeholder="留空或 ******** 表示不修改"
              />
            </n-form-item>
          </template>
        </n-collapse-item>
      </n-collapse>
    </template>
    <template v-else>
      <n-form-item label="Authtoken">
        <n-input
          v-model:value="form.config.authtoken"
          type="password"
          show-password-on="click"
          placeholder="留空表示无；******** 表示不修改"
        />
      </n-form-item>
      <n-form-item label="区域（可选）">
        <n-input v-model:value="form.config.region" placeholder="例如 jp / us / eu" />
      </n-form-item>
    </template>
    <n-form-item label="启用">
      <n-switch v-model:value="form.enabled" />
    </n-form-item>
    <n-form-item v-if="isAdmin" label="授权">
      <AccessEditor v-model="form.access" />
    </n-form-item>
  </n-form>
</template>

<script setup>
import { ref } from 'vue'
import AccessEditor from './AccessEditor.vue'

defineProps({
  form: { type: Object, required: true },
  isAdmin: { type: Boolean, default: false }
})

const formRef = ref(null)

const rules = {
  name: { required: true, message: '请输入名称', trigger: 'blur' },
  'config.serverAddr': { required: true, message: '请输入服务器地址', trigger: 'blur' }
}

function validate() {
  return formRef.value.validate()
}

defineExpose({ validate })
</script>
