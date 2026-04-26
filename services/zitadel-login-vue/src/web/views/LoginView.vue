<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { sanitizeLoginHint } from '@shared/routes'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useLoginFlowStore } from '@/stores/loginFlow'

const route = useRoute()
const router = useRouter()
const flow = useLoginFlowStore()
const loginName = ref('')

onMounted(async () => {
  flow.hydrateFromRoute(route.query.authRequest)
  loginName.value = routeLoginHint()
  window.history.replaceState(window.history.state, '', window.location.pathname)
  if (loginName.value) await submit()
})

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
    <form class="form-stack" @submit.prevent="submit">
      <div class="heading-stack">
        <h1 id="login-title">Masuk</h1>
        <p>Masukkan email yang terdaftar untuk melanjutkan.</p>
      </div>

      <label class="field">
        <span>Email *</span>
        <input
          v-model="loginName"
          autocomplete="username"
          inputmode="email"
          placeholder="user@company.com"
          :disabled="flow.isLoading"
        />
      </label>

      <p v-if="flow.errorMessage" class="alert" role="alert">{{ flow.errorMessage }}</p>

      <div class="form-actions">
        <a class="link-action" href="/auth/password-reset">Lupa kata sandi?</a>
        <button class="button button--primary" type="submit" :disabled="flow.isLoading">
          <span>{{ flow.isLoading ? 'Memproses...' : 'Lanjutkan' }}</span>
          <ArrowRight :size="17" aria-hidden="true" />
        </button>
      </div>
    </form>
  </AuthShell>
</template>
