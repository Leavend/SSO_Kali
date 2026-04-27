<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LOGIN_MESSAGES } from '@shared/messages'
import { sanitizeLoginHint } from '@shared/routes'
import AuthShell from '@/components/auth/AuthShell.vue'
import { requestPasswordReset } from '@/utils/selfService'

const route = useRoute()
const router = useRouter()
const loginName = ref(sanitizeLoginHint(route.query.login_hint || route.query.loginName))
const message = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

async function submit(): Promise<void> {
  const value = loginName.value.trim()
  if (!value) return fail(LOGIN_MESSAGES.invalidLoginName)
  isLoading.value = true
  errorMessage.value = ''
  try {
    message.value = await requestPasswordReset(value)
  } catch (error) {
    fail(error instanceof Error ? error.message : LOGIN_MESSAGES.generic)
  } finally {
    isLoading.value = false
  }
}

function fail(value: string): void {
  errorMessage.value = value
}
</script>

<template>
  <AuthShell>
    <form class="signin-card" @submit.prevent="submit">
      <h1 id="login-title">Atur ulang kata sandi</h1>
      <p>Masukkan email terdaftar untuk menerima instruksi reset kata sandi.</p>

      <label class="field-group">
        <span>Email <span aria-hidden="true">*</span></span>
        <input v-model="loginName" autocomplete="username" inputmode="email" placeholder="user@company.com" />
      </label>

      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>

      <div class="signin-actions signin-actions--split">
        <button class="signin-secondary" type="button" @click="router.push('/login')">Kembali</button>
        <button class="signin-submit" type="submit" :disabled="isLoading">
          {{ isLoading ? 'Memproses...' : 'Kirim Instruksi' }}
        </button>
      </div>
    </form>
  </AuthShell>
</template>
