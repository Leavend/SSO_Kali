<script setup lang="ts">
/**
 * LoginView — production SSO Portal login.
 *
 * This page intentionally mirrors the portal login contract referenced by
 * GitHub Actions run 25839593179. The older `AuthShell` / `.signin-card`
 * shell is not used here to prevent future wrong-target fixes.
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, Eye, EyeOff, Lock, Moon, ShieldCheck, Sun } from 'lucide-vue-next'

const identifier = ref('')
const password = ref('')
const isPasswordVisible = ref(false)
const isLoading = ref(false)
const error = ref('')
const remainingAttempts = ref<number | null>(null)
const themeMode = ref<'light' | 'dark'>('light')

const canSubmit = computed(() => identifier.value.trim().length > 0 && password.value.length > 0 && !isLoading.value)
const passwordInputType = computed(() => (isPasswordVisible.value ? 'text' : 'password'))
const themeToggleLabel = computed(() => (themeMode.value === 'dark' ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'))

async function submitLocalLogin(): Promise<void> {
  if (!canSubmit.value) return
  isLoading.value = true
  error.value = ''

  try {
    const response = await fetch('/connect/local-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        email: identifier.value.trim(),
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
    isLoading.value = false
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
  isLoading.value = false
}

function resetLoadingWhenVisible(): void {
  if (document.visibilityState === 'visible') {
    resetLoading()
  }
}

function togglePasswordVisibility(): void {
  isPasswordVisible.value = !isPasswordVisible.value
}

function syncThemeFromDocument(): void {
  themeMode.value = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function toggleTheme(): void {
  const nextTheme = themeMode.value === 'dark' ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', nextTheme === 'dark')
  themeMode.value = nextTheme
}

onMounted(() => {
  resetLoading()
  syncThemeFromDocument()
  window.addEventListener('pageshow', resetLoading)
  window.addEventListener('focus', resetLoading)
  document.addEventListener('visibilitychange', resetLoadingWhenVisible)
})

onBeforeUnmount(() => {
  window.removeEventListener('pageshow', resetLoading)
  window.removeEventListener('focus', resetLoading)
  document.removeEventListener('visibilitychange', resetLoadingWhenVisible)
})
</script>

<template>
  <main class="portal-login" aria-labelledby="login-title">
    <div class="portal-login__backdrop" aria-hidden="true" />

    <button
      id="portal-theme-toggle"
      class="portal-login__theme-toggle"
      type="button"
      :aria-label="themeToggleLabel"
      @click="toggleTheme"
    >
      <Sun v-if="themeMode === 'dark'" :size="18" aria-hidden="true" />
      <Moon v-else :size="18" aria-hidden="true" />
    </button>

    <section class="portal-login__shell">
      <header class="portal-login__brand" aria-label="Dev-SSO">
        <span class="portal-login__logo" aria-hidden="true">
          <ShieldCheck :size="22" />
        </span>
        <h2>Dev-SSO</h2>
        <p>Portal autentikasi tunggal untuk semua aplikasi kamu.</p>
      </header>

      <form class="portal-login__card" novalidate @submit.prevent="submitLocalLogin">
        <div class="portal-login__card-header">
          <h1 id="login-title">Masuk ke akunmu</h1>
          <p>Gunakan kredensial SSO-mu untuk mengakses semua aplikasi kerja.</p>
        </div>

        <div v-if="error" class="portal-login__alert" role="alert">
          <Lock :size="16" aria-hidden="true" />
          <span>{{ error }}</span>
          <span v-if="remainingAttempts !== null" class="portal-login__attempts">
            ({{ remainingAttempts }} percobaan tersisa)
          </span>
        </div>

        <div class="portal-login__field">
          <label for="login-identifier">Email atau username</label>
          <input
            id="login-identifier"
            v-model="identifier"
            name="identifier"
            type="text"
            autocomplete="username"
            inputmode="email"
            required
            autofocus
            placeholder="user@company.com"
            :disabled="isLoading"
          />
        </div>

        <div class="portal-login__field">
          <label for="login-password">Password</label>
          <div class="portal-login__password-control">
            <input
              id="login-password"
              v-model="password"
              name="password"
              :type="passwordInputType"
              autocomplete="current-password"
              required
              placeholder="••••••••"
              :disabled="isLoading"
            />
            <button
              id="portal-password-toggle"
              type="button"
              class="portal-login__password-toggle"
              :aria-label="isPasswordVisible ? 'Sembunyikan password' : 'Tampilkan password'"
              @click="togglePasswordVisibility"
            >
              <EyeOff v-if="isPasswordVisible" :size="18" aria-hidden="true" />
              <Eye v-else :size="18" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          id="portal-login-submit"
          class="portal-login__submit"
          type="submit"
          :disabled="!canSubmit"
          :aria-busy="isLoading || undefined"
        >
          <span v-if="isLoading">Memproses…</span>
          <span v-else class="portal-login__submit-label">
            Masuk
            <ArrowRight :size="17" aria-hidden="true" />
          </span>
        </button>

        <footer class="portal-login__register">
          Belum punya akun?
          <a href="/auth/register">Daftar sekarang</a>
        </footer>
      </form>
    </section>
  </main>
</template>
