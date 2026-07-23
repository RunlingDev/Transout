import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/Home.vue'), meta: { public: true } },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/docs',
    component: () => import('../layouts/DocsLayout.vue'),
    meta: { public: true },
    redirect: '/docs/intro',
    children: [
      { path: 'intro', name: 'doc-intro', component: () => import('../views/docs/Intro.vue') },
      { path: 'quickstart', name: 'doc-quickstart', component: () => import('../views/docs/QuickStart.vue') },
      { path: 'deploy', name: 'doc-deploy', component: () => import('../views/docs/Deploy.vue') },
      { path: 'guide', name: 'doc-guide', component: () => import('../views/docs/Guide.vue') },
      { path: 'api', name: 'doc-api', component: () => import('../views/docs/Api.vue') },
      { path: 'faq', name: 'doc-faq', component: () => import('../views/docs/Faq.vue') }
    ]
  },
  {
    path: '/console',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'tunnels', name: 'tunnels', component: () => import('../views/Tunnels.vue') },
      { path: 'tunnels/:id', name: 'tunnel-detail', component: () => import('../views/TunnelDetail.vue') },
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
    if (auth.token && to.name === 'login') return { path: '/console' }
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
  if (to.meta.admin && !auth.isAdmin) return { path: '/console' }
  return true
})

export default router
