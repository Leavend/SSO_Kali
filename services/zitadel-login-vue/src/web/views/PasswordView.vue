<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useLoginFlowStore } from '@/stores/loginFlow'
import { passwordResetHref } from '@/utils/authLinks'

const router = useRouter()
const flow = useLoginFlowStore()
const password = ref('')
const resetHref = computed(() => passwordResetHref(flow.loginName))

async function submit(): Promise<void> {
  const next = await flow.submitPassword(password.value)
  if (next === 'otp') await router.push({ path: '/otp/time-based' })
  if (next === 'signedin') await router.push({ path: '/signedin' })
}
</script>

<template>
  <AuthShell>
    <form class="signin-card" @submit.prevent="submit">
      <h1 id="login-title">Kata sandi</h1>
      <p>Masukkan kata sandi Anda.</p>

      <div class="account-pill" aria-label="Akun yang dipilih">
        <span aria-hidden="true">{{ flow.displayName.slice(0, 2).toUpperCase() }}</span>
        <strong>{{ flow.displayName }}</strong>
      </div>

      <label class="field-group">
        <span>Kata sandi</span>
        <input v-model="password" autocomplete="current-password" type="password" />
      </label>

      <a class="link-action" :href="resetHref">Atur Ulang Kata Sandi</a>
      <p v-if="flow.errorMessage" class="alert" role="alert">{{ flow.errorMessage }}</p>

      <div class="signin-actions signin-actions--split">
        <button class="signin-secondary" type="button" @click="router.push('/login')">Kembali</button>
        <button class="signin-submit" type="submit" :disabled="flow.isLoading">
          {{ flow.isLoading ? 'Memproses...' : 'Lanjutkan' }}
        </button>
      </div>
    </form>
  </AuthShell>
</template>
