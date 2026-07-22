import axios from 'axios'
import { createDiscreteApi } from 'naive-ui'

const { message } = createDiscreteApi(['message'])

const api = axios.create({
  baseURL: '/api',
  timeout: 15000
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const resp = error.response
    const msg = resp?.data?.error || error.message || '请求失败'
    if (resp?.status === 401) {
      localStorage.removeItem('token')
      if (!window.location.pathname.startsWith('/login')) {
        message.error('登录已过期，请重新登录')
        window.location.href = '/login'
        return new Promise(() => {})
      }
    } else {
      message.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

export default api
