<script setup lang="ts">
import AuthShell from '@/components/auth/AuthShell.vue'
import { useLoginFlowStore } from '@/stores/loginFlow'

const flow = useLoginFlowStore()
</script>

<template>
  <AuthShell>
    <div class="form-stack form-stack--center">
      <div class="heading-stack">
        <h1 id="login-title">Selamat datang</h1>
        <p>Anda sudah masuk.</p>
      </div>

      <div class="account-pill" aria-label="Akun yang dipilih">
        <span aria-hidden="true">{{ flow.displayName.slice(0, 2).toUpperCase() }}</span>
        <strong>{{ flow.displayName }}</strong>
      </div>
    </div>
  </AuthShell>
</template>
