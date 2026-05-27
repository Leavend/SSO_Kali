import { createRouter, createWebHistory } from 'vue-router'
import { resolveAdminGuard } from './guards'
import ForbiddenView from '@/views/ForbiddenView.vue'
import AdminErrorView from '@/views/AdminErrorView.vue'
import AdminShellLayout from '@/layouts/AdminShellLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/',
      component: AdminShellLayout,
      children: [
        {
          path: 'dashboard',
          name: 'admin.dashboard',
          component: () => import('@/features/dashboard/pages/DashboardPage.vue'),
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        },
        {
          path: 'oidc-foundation',
          name: 'admin.oidc-foundation',
          component: () => import('@/features/oidc-foundation/pages/OidcFoundationPage.vue'),
          meta: { requiresAdmin: true, permissions: ['admin.dashboard.view'] },
        },
        {
          path: 'clients',
          name: 'admin.clients',
          component: () => import('@/features/clients/pages/ClientsPage.vue'),
          meta: { requiresAdmin: true, permissions: ['admin.clients.read'] },
        },
        {
          path: 'users',
          name: 'admin.users',
          component: () => import('@/features/users/pages/UsersPage.vue'),
          meta: { requiresAdmin: true, permissions: ['admin.users.read'] },
        },
      ],
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
