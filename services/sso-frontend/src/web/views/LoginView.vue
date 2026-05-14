<script setup lang="ts">
/**
 * FR-014 / ISSUE-04: Dual-mode login view.
 *
 * Supports:
 * - Upstream OIDC login (email → redirect to IdP)
 * - Local password login (email + password → POST /connect/local-login)
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, KeyRound, Lock } from 'lucide-vue-next'
import { AUTH_SHELL } from '@parent-ui/auth-shell.mjs'
import AuthShell from '@/components/auth/AuthShell.vue'

const route = useRoute()
const email = ref('')
const password = ref('')
const loading = ref(false)
const mode = ref<'email' | 'password'>('email')
const error = ref('')
const remainingAttempts = ref<number | null>(null)
let loadingResetTimer: number | undefined

const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/home'
})

function submitSso(): void {
  if (!email.value.trim()) return
  loading.value = true
  error.value = ''
  const params = new URLSearchParams({ return_to: returnTo.value })
  params.set('login_hint', email.value.trim())
  const target = `/auth/login?${params.toString()}`
  clearLoadingResetTimer()
  loadingResetTimer = window.setTimeout(resetLoading, 8000)
  window.location.assign(target)
}

function showPasswordMode(): void {
  mode.value = 'password'
  error.value = ''
}

function backToEmail(): void {
  mode.value = 'email'
  password.value = ''
  error.value = ''
  remainingAttempts.value = null
}

async function submitLocalLogin(): Promise<void> {
  if (!email.value.trim() || !password.value) return
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/connect/local-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        email: email.value.trim(),
        password: password.value,
        client_id: getClientId(),
        redirect_uri: getRedirectUri(),
        code_challenge: getCodeChallenge(),
        code_challenge_method: 'S256',
        state: getState(),
        nonce: getNonce(),
        scope: getScope(),
      }),
    })

    const data = await response.json()

    if (response.ok && data.redirect_uri) {
      window.location.href = data.redirect_uri
      return
    }

    if (response.status === 429) {
      error.value = data.message ?? 'Terlalu banyak percobaan. Coba lagi nanti.'
    } else if (data.error === 'account_locked') {
      error.value = data.message ?? 'Akun Anda telah dikunci.'
    } else {
      error.value = data.message ?? 'Email atau password salah.'
      remainingAttempts.value = data.remaining_attempts ?? null
    }
  } catch {
    error.value = 'Terjadi kesalahan jaringan.'
  } finally {
    loading.value = false
  }
}

function getClientId(): string {
  return new URLSearchParams(window.location.search).get('client_id') ?? 'sso-frontend-portal'
}

function getRedirectUri(): string {
  return new URLSearchParams(window.location.search).get('redirect_uri') ?? `${window.location.origin}/auth/callback`
}

function getCodeChallenge(): string {
  return new URLSearchParams(window.location.search).get('code_challenge') ?? ''
}

function getState(): string {
  return new URLSearchParams(window.location.search).get('state') ?? crypto.randomUUID()
}

function getNonce(): string {
  return new URLSearchParams(window.location.search).get('nonce') ?? crypto.randomUUID()
}

function getScope(): string {
  return new URLSearchParams(window.location.search).get('scope') ?? 'openid profile email'
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
    <form class="signin-card" @submit.prevent="mode === 'password' ? submitLocalLogin() : submitSso()">
      <h1 id="login-title">{{ AUTH_SHELL.copy.loginTitle }}</h1>
      <p>{{ AUTH_SHELL.copy.loginSubtitle }}</p>

      <div v-if="error" class="login-error" role="alert">
        <Lock :size="14" aria-hidden="true" />
        <span>{{ error }}</span>
        <span v-if="remainingAttempts !== null" class="login-error__attempts">
          ({{ remainingAttempts }} percobaan tersisa)
        </span>
      </div>

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
          :disabled="loading || mode === 'password'"
        />
      </div>

      <div v-if="mode === 'password'" class="field-group">
        <label for="login-password">Password <span aria-hidden="true">*</span></label>
        <input
          id="login-password"
          v-model="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
          placeholder="••••••••"
          :disabled="loading"
        />
      </div>

      <div class="signin-actions">
        <button
          v-if="mode === 'email'"
          class="signin-submit"
          type="submit"
          :disabled="loading || !email.trim()"
        >
          <span v-if="loading" class="loading-inline">
            <span class="spinner" aria-hidden="true" />
            {{ AUTH_SHELL.copy.processingButton }}
          </span>
          <span v-else class="signin-submit__label">
            {{ AUTH_SHELL.copy.continueButton }}
            <ArrowRight :size="17" aria-hidden="true" />
          </span>
        </button>

        <button
          v-if="mode === 'password'"
          class="signin-submit"
          type="submit"
          :disabled="loading || !email.trim() || !password"
        >
          <span v-if="loading" class="loading-inline">
            <span class="spinner" aria-hidden="true" />
            {{ AUTH_SHELL.copy.processingButton }}
          </span>
          <span v-else class="signin-submit__label">
            <KeyRound :size="17" aria-hidden="true" />
            Login
          </span>
        </button>
      </div>

      <div class="login-mode-switch">
        <button
          v-if="mode === 'email'"
          type="button"
          class="login-mode-link"
          @click="showPasswordMode"
        >
          <KeyRound :size="14" aria-hidden="true" />
          Login dengan password
        </button>
        <button
          v-if="mode === 'password'"
          type="button"
          class="login-mode-link"
          @click="backToEmail"
        >
          <ArrowRight :size="14" aria-hidden="true" style="transform: rotate(180deg)" />
          Kembali ke login SSO
        </button>
      </div>
    </form>

    <div class="register-card">
      {{ AUTH_SHELL.copy.registerPrompt }}
    </div>
  </AuthShell>
</template>

<style scoped>
.login-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171;
  font-size: 0.8125rem;
  margin-bottom: 4px;
}

.login-error__attempts {
  color: #a1a1aa;
  font-size: 0.75rem;
}

.login-mode-switch {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.login-mode-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.login-mode-link:hover {
  background: rgba(99, 102, 241, 0.1);
}
</style>
