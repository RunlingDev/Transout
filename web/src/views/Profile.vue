<template>
  <div class="profile-page">
    <n-card title="个人资料" style="max-width: 420px">
      <div class="avatar-row">
        <n-avatar round :size="64" :src="avatarUrl(emailDraft, 128)">{{ avatarText }}</n-avatar>
        <div class="avatar-hint">头像由邮箱经 Cravatar/Gravatar 生成</div>
      </div>
      <n-form label-placement="top">
        <n-form-item label="邮箱">
          <n-input v-model:value="emailDraft" placeholder="name@example.com" />
        </n-form-item>
        <n-button type="primary" :loading="savingEmail" @click="onSaveEmail">保存邮箱</n-button>
      </n-form>
    </n-card>

    <n-card title="修改密码" style="max-width: 420px; margin-top: 20px">
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
import { computed, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'
import api from '../api'
import { useAuthStore } from '../stores/auth'
import { avatarUrl } from '../utils/avatar'

const message = useMessage()
const auth = useAuthStore()

const formRef = ref(null)
const saving = ref(false)
const savingEmail = ref(false)
const form = reactive({ old_password: '', new_password: '', confirm: '' })

const emailDraft = ref(auth.user?.email || '')
const avatarText = computed(() => (auth.user?.username || '?').slice(0, 1).toUpperCase())

async function onSaveEmail() {
  if (emailDraft.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDraft.value)) {
    message.error('邮箱格式不正确')
    return
  }
  savingEmail.value = true
  try {
    const data = await api.put('/auth/email', { email: emailDraft.value })
    auth.user = data.user
    message.success('邮箱已保存')
  } catch {
    // 拦截器已提示
  } finally {
    savingEmail.value = false
  }
}

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
  flex-direction: column;
  align-items: center;
  padding-top: 40px;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.avatar-hint {
  font-size: 12px;
  opacity: 0.55;
}
</style>
