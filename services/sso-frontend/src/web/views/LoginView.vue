<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { AUTH_ROUTES, identityActionHref } from '@parent-ui/auth-shell.mjs'
import AuthShell from '@/components/auth/AuthShell.vue'

const route = useRoute()
const email = ref('')
const loading = ref(false)
let loadingResetTimer: number | undefined

const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
})

const passwordResetHref = computed(() => identityActionHref(AUTH_ROUTES.identityActions.passwordReset, email.value))
const registerHref = computed(() => identityActionHref(AUTH_ROUTES.identityActions.register, email.value))

function submit(): void {
  if (!email.value.trim()) return
  loading.value = true
  const params = new URLSearchParams({ return_to: returnTo.value })
  params.set('login_hint', email.value.trim())
  const target = `/auth/login?${params.toString()}`
  clearLoadingResetTimer()
  loadingResetTimer = window.setTimeout(resetLoading, 8000)
  window.location.assign(target)
}

function resetLoading(): void {
  loading.value = false
  clearLoadingResetTimer()
}

function clearLoadingResetTimer(): void {
  if (loadingResetTimer !== undefined) {
    window.clearTimeout(loadingResetTimer)
    loadingResetTimer = undefined
  }
}

function resetLoadingAfterIdentityReturn(): void {
  resetLoading()
}

function resetLoadingWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    resetLoading()
  }
}

onMounted(() => {
  resetLoading()
  window.addEventListener('pageshow', resetLoadingAfterIdentityReturn)
  window.addEventListener('focus', resetLoadingAfterIdentityReturn)
  document.addEventListener('visibilitychange', resetLoadingWhenVisible)
})

onBeforeUnmount(() => {
  clearLoadingResetTimer()
  window.removeEventListener('pageshow', resetLoadingAfterIdentityReturn)
  window.removeEventListener('focus', resetLoadingAfterIdentityReturn)
  document.removeEventListener('visibilitychange', resetLoadingWhenVisible)
})
</script>

<template>
  <AuthShell labelledby="login-title">
    <form class="signin-card" @submit.prevent="submit">
      <h1 id="login-title">Masuk</h1>
      <p>Masukkan email yang terdaftar untuk melanjutkan.</p>

      <div class="field-group">
        <label for="login-email">Email <span aria-hidden="true">*</span></label>
        <input
          id="login-email"
          v-model="email"
          name="email"
          type="email"
          autocomplete="username"
          autofocus
          required
          placeholder="user@company.com"
          :disabled="loading"
        />
      </div>

      <div class="signin-actions">
        <a :href="passwordResetHref">Lupa kata sandi?</a>
        <button class="signin-submit" type="submit" :disabled="loading || !email.trim()">
          <span v-if="loading" class="loading-inline">
            <span class="spinner" aria-hidden="true" />
            Loading...
          </span>
          <span v-else>Lanjutkan</span>
        </button>
      </div>
    </form>

    <div class="register-card">
      Belum memiliki akun?
      <a :href="registerHref">Daftar Sekarang</a>
    </div>
  </AuthShell>
</template>
