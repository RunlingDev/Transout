import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'tunnels', name: 'tunnels', component: () => import('../views/Tunnels.vue') },
      { path: 'channels', name: 'channels', component: () => import('../views/Channels.vue'), meta: { admin: true } },
      { path: 'users', name: 'users', component: () => import('../views/Users.vue'), meta: { admin: true } },
      { path: 'groups', name: 'groups', component: () => import('../views/Groups.vue'), meta: { admin: true } },
      { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue'), meta: { admin: true } },
      { path: 'profile', name: 'profile', component: () => import('../views/Profile.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    if (auth.token && to.name === 'login') return { path: '/' }
    return true
  }
  if (!auth.token) return { path: '/login' }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      return { path: '/login' }
    }
  }
  if (to.meta.admin && !auth.isAdmin) return { path: '/' }
  return true
})

export default router
