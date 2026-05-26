import { createRouter, createWebHistory } from 'vue-router'
import { resolveAdminGuard } from './guards'
import HomeView from '@/views/HomeView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import AdminErrorView from '@/views/AdminErrorView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'admin.home',
      component: HomeView,
      meta: { requiresAdmin: true },
    },
    {
      path: '/oidc-foundation',
      name: 'admin.oidc-foundation',
      component: () => import('@/features/oidc-foundation/pages/OidcFoundationPage.vue'),
      meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
    },
    {
      path: '/forbidden',
      name: 'admin.forbidden',
      component: ForbiddenView,
    },
    {
      path: '/admin-error',
      name: 'admin.error',
      component: AdminErrorView,
    },
  ],
})

router.beforeEach(resolveAdminGuard)

export default router
