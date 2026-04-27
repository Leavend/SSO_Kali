<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sanitizeLoginHint } from '@shared/routes'
import AuthShell from '@/components/auth/AuthShell.vue'

const route = useRoute()
const router = useRouter()
const loginName = ref(sanitizeLoginHint(route.query.login_hint || route.query.loginName))
</script>

<template>
  <AuthShell>
    <form class="signin-card" @submit.prevent="router.push('/login')">
      <h1 id="login-title">Daftar</h1>
      <p>Pendaftaran akun baru dikelola oleh administrator Dev-SSO.</p>

      <label class="field-group">
        <span>Email</span>
        <input v-model="loginName" autocomplete="username" inputmode="email" placeholder="user@company.com" />
      </label>

      <p class="notice" role="status">Gunakan akun yang sudah terdaftar atau hubungi administrator untuk akses baru.</p>

      <div class="signin-actions signin-actions--split">
        <button class="signin-secondary" type="button" @click="router.push('/login')">Kembali</button>
        <button class="signin-submit" type="submit">Masuk</button>
      </div>
    </form>
  </AuthShell>
</template>
