<script setup lang="ts">
import { computed, ref } from 'vue'
import { Layers } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'

const route = useRoute()
const email = ref('')
const loading = ref(false)

const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
})

const passwordResetHref = computed(() => identityActionHref('/auth/password-reset', email.value))
const registerHref = computed(() => identityActionHref('/auth/register', email.value))

function submit(): void {
  if (!email.value.trim()) return
  loading.value = true
  const params = new URLSearchParams({ return_to: returnTo.value })
  params.set('login_hint', email.value.trim())
  window.location.assign(`/auth/login?${params.toString()}`)
}

function identityActionHref(path: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return path

  const params = new URLSearchParams({ login_hint: trimmed })
  return `${path}?${params.toString()}`
}
</script>

<template>
  <section class="legacy-login" aria-labelledby="login-title">
    <div class="theme-toggle-anchor">
      <ThemeToggle />
    </div>

    <div class="legacy-login__frame">
      <div class="legacy-login__header">
        <div class="legacy-login__mark" aria-hidden="true">
          <Layers :size="20" stroke-width="2.2" />
        </div>
        <p>Dev-SSO</p>
      </div>

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
    </div>

    <footer class="auth-footer" aria-label="Legal links">
      <span>&copy; 2026 Dev-SSO</span>
      <span aria-hidden="true">.</span>
      <a href="#">Terms</a>
      <span aria-hidden="true">.</span>
      <a href="#">Privacy</a>
      <span aria-hidden="true">.</span>
      <a href="#">Docs</a>
    </footer>
  </section>
</template>
