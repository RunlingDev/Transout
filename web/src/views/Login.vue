<template>
  <div class="login-page">
    <n-card class="login-card">
      <div class="brand">Transout</div>
      <div class="subtitle">{{ needsSetup ? '创建管理员账户，开始使用' : '登录内网穿透控制面板' }}</div>
      <n-form @submit.prevent="onSubmit">
        <n-form-item :show-label="false" :show-feedback="false">
          <n-input v-model:value="username" placeholder="用户名" size="large" />
        </n-form-item>
        <n-form-item :show-label="false" :show-feedback="false">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            size="large"
            @keyup.enter="onSubmit"
          />
        </n-form-item>
        <n-button
          type="primary"
          size="large"
          block
          :loading="loading"
          :disabled="!username || !password"
          @click="onSubmit"
        >
          {{ needsSetup ? '创建并登录' : '登录' }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const needsSetup = ref(false)
const username = ref('')
const password = ref('')
const loading = ref(false)

onMounted(async () => {
  try {
    const data = await api.get('/auth/bootstrap')
    needsSetup.value = !!data.needs_setup
  } catch {
    // 拦截器已提示
  }
})

async function onSubmit() {
  loading.value = true
  try {
    if (needsSetup.value) {
      await auth.bootstrap(username.value, password.value)
    } else {
      await auth.login(username.value, password.value)
    }
    router.push('/')
  } catch {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.login-card {
  width: 380px;
}
.login-card :deep(.n-form-item) {
  margin-bottom: 20px;
}
.login-card :deep(.n-button) {
  margin-top: 4px;
}
.brand {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
}
.subtitle {
  text-align: center;
  opacity: 0.6;
  font-size: 14px;
  margin: 8px 0 28px;
}
</style>
