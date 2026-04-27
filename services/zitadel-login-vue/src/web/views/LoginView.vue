<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { sanitizeLoginHint } from '@shared/routes'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useLoginFlowStore } from '@/stores/loginFlow'
import { passwordResetHref, registerHref } from '@/utils/authLinks'

const route = useRoute()
const router = useRouter()
const flow = useLoginFlowStore()
const loginName = ref('')
const isResolvingEntry = ref(true)
const resetHref = computed(() => passwordResetHref(loginName.value))
const signupHref = computed(() => registerHref(loginName.value))

onMounted(async () => {
  await resolveEntryRoute()
})

async function resolveEntryRoute(): Promise<void> {
  const authRequest = flow.hydrateFromRoute(route.query.authRequest)
  const hint = routeLoginHint()
  window.history.replaceState(window.history.state, '', window.location.pathname)
  if (hint) return await submitHint(hint)
  if (authRequest && await submitAuthRequest(authRequest)) return
  isResolvingEntry.value = false
}

async function submitHint(value: string): Promise<void> {
  loginName.value = value
  await submit()
  isResolvingEntry.value = false
}

async function submitAuthRequest(authRequest: string): Promise<boolean> {
  const next = await flow.submitAuthRequest(authRequest)
  if (next === 'password') await router.replace({ path: '/password' })
  return next === 'password'
}

async function submit(): Promise<void> {
  const next = await flow.submitLoginName(loginName.value)
  if (next) await router.push({ path: '/password' })
}

function routeLoginHint(): string {
  return sanitizeLoginHint(route.query.login_hint || route.query.loginName)
}
</script>

<template>
  <AuthShell>
    <div v-if="isResolvingEntry" class="signin-card signin-card--status" aria-busy="true">
      <h1 id="login-title">Menyiapkan sesi masuk</h1>
      <p>Mohon tunggu sebentar.</p>
    </div>

    <form v-else class="signin-card" @submit.prevent="submit">
      <h1 id="login-title">Masuk</h1>
      <p>Masukkan email yang terdaftar untuk melanjutkan.</p>

      <label class="field-group">
        <span>Email <span aria-hidden="true">*</span></span>
        <input
          v-model="loginName"
          autocomplete="username"
          inputmode="email"
          placeholder="user@company.com"
          :disabled="flow.isLoading"
        />
      </label>

      <p v-if="flow.errorMessage" class="alert" role="alert">{{ flow.errorMessage }}</p>

      <div class="signin-actions">
        <a class="link-action" :href="resetHref">Lupa kata sandi?</a>
        <button class="signin-submit" type="submit" :disabled="flow.isLoading">
          <span>{{ flow.isLoading ? 'Memproses...' : 'Lanjutkan' }}</span>
          <ArrowRight :size="17" aria-hidden="true" />
        </button>
      </div>
    </form>

    <div v-if="!isResolvingEntry" class="register-card">
      Belum memiliki akun?
      <a :href="signupHref">Daftar Sekarang</a>
    </div>
  </AuthShell>
</template>
