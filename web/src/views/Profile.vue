<template>
  <div class="profile-page">
    <n-card title="修改密码" style="max-width: 420px">
      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top">
        <n-form-item label="当前密码" path="old_password">
          <n-input
            v-model:value="form.old_password"
            type="password"
            show-password-on="click"
            placeholder="当前密码"
          />
        </n-form-item>
        <n-form-item label="新密码" path="new_password">
          <n-input
            v-model:value="form.new_password"
            type="password"
            show-password-on="click"
            placeholder="新密码"
          />
        </n-form-item>
        <n-form-item label="确认新密码" path="confirm">
          <n-input
            v-model:value="form.confirm"
            type="password"
            show-password-on="click"
            placeholder="再次输入新密码"
          />
        </n-form-item>
        <n-button type="primary" :loading="saving" @click="onSave">保存</n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import api from '../api'

const message = useMessage()

const formRef = ref(null)
const saving = ref(false)
const form = reactive({ old_password: '', new_password: '', confirm: '' })

const rules = {
  old_password: { required: true, message: '请输入当前密码', trigger: 'blur' },
  new_password: { required: true, message: '请输入新密码', trigger: 'blur' },
  confirm: {
    validator: (rule, value) => {
      if (!value) return new Error('请再次输入新密码')
      if (value !== form.new_password) return new Error('两次输入的密码不一致')
      return true
    },
    trigger: 'blur'
  }
}

async function onSave() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await api.put('/auth/password', {
      old_password: form.old_password,
      new_password: form.new_password
    })
    message.success('密码已更新')
    form.old_password = ''
    form.new_password = ''
    form.confirm = ''
  } catch {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.profile-page {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}
</style>
