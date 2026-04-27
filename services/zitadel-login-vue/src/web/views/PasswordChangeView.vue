<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LOGIN_MESSAGES } from '@shared/messages'
import { sanitizeFlowId } from '@shared/routes'
import AuthShell from '@/components/auth/AuthShell.vue'
import { changePassword } from '@/utils/selfService'

const route = useRoute()
const router = useRouter()
const userId = sanitizeFlowId(route.query.userID || route.query.userId) || ''
const code = sanitizeFlowId(route.query.code) || ''
const password = ref('')
const message = ref('')
const errorMessage = ref('')
const isLoading = ref(false)

async function submit(): Promise<void> {
  if (!userId || !code || !password.value) return fail(LOGIN_MESSAGES.invalidPasswordReset)
  isLoading.value = true
  errorMessage.value = ''
  try {
    message.value = await changePassword(userId, code, password.value)
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
      <h1 id="login-title">Buat kata sandi baru</h1>
      <p>Masukkan kata sandi baru untuk menyelesaikan reset akun.</p>

      <label class="field-group">
        <span>Kata sandi baru</span>
        <input v-model="password" autocomplete="new-password" type="password" />
      </label>

      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>

      <div class="signin-actions signin-actions--split">
        <button class="signin-secondary" type="button" @click="router.push('/login')">Kembali</button>
        <button class="signin-submit" type="submit" :disabled="isLoading">
          {{ isLoading ? 'Memproses...' : 'Simpan Kata Sandi' }}
        </button>
      </div>
    </form>
  </AuthShell>
</template>
