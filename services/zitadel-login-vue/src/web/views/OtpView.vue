<script setup lang="ts">
import { watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/components/auth/AuthShell.vue'
import { useLoginFlowStore } from '@/stores/loginFlow'

const router = useRouter()
const flow = useLoginFlowStore()
const code = ref('')

watch(code, async (value) => {
  if (value.replace(/\D/g, '').length >= 6 && !flow.isLoading) await submit()
})

async function submit(): Promise<void> {
  const next = await flow.submitOtp(code.value)
  if (next) await router.push({ path: '/signedin' })
}
</script>

<template>
  <AuthShell>
    <form class="form-stack" @submit.prevent="submit">
      <div class="heading-stack">
        <h1 id="login-title">Verifikasi 2 Langkah</h1>
        <p>Masukkan kode dari aplikasi autentikator Anda.</p>
      </div>

      <div class="account-pill" aria-label="Akun yang dipilih">
        <span aria-hidden="true">{{ flow.displayName.slice(0, 2).toUpperCase() }}</span>
        <strong>{{ flow.displayName }}</strong>
      </div>

      <label class="field">
        <span>Kode</span>
        <input v-model="code" autocomplete="one-time-code" inputmode="numeric" maxlength="8" />
      </label>

      <p v-if="flow.errorMessage" class="alert" role="alert">{{ flow.errorMessage }}</p>

      <div class="form-actions form-actions--split">
        <button class="button button--secondary" type="button" @click="router.push('/password')">Kembali</button>
        <button class="button button--primary" type="submit" :disabled="flow.isLoading">
          {{ flow.isLoading ? 'Memproses...' : 'Lanjutkan' }}
        </button>
      </div>
    </form>
  </AuthShell>
</template>
