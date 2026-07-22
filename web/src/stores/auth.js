import { defineStore } from 'pinia'
import api from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: null
  }),
  getters: {
    isAdmin: (state) => !!state.user?.is_admin
  },
  actions: {
    setSession(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('token', token)
    },
    async login(username, password) {
      const data = await api.post('/auth/login', { username, password })
      this.setSession(data.token, data.user)
    },
    async bootstrap(username, password) {
      const data = await api.post('/auth/bootstrap', { username, password })
      this.setSession(data.token, data.user)
    },
    async fetchMe() {
      this.user = await api.get('/auth/me')
    },
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('token')
    }
  }
})
