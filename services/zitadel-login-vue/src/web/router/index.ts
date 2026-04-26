import { createRouter, createWebHistory } from 'vue-router'

import { normalizeBasePath } from '@shared/routes'

const basePath = normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH)

export const router = createRouter({
  history: createWebHistory(`${basePath}/`),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    { path: '/password', component: () => import('@/views/PasswordView.vue') },
    { path: '/otp/time-based', component: () => import('@/views/OtpView.vue') },
    { path: '/signedin', component: () => import('@/views/SignedInView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})
