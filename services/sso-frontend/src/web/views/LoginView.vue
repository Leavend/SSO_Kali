<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { useAdminStore } from '@/stores/admin'

const route = useRoute()
const admin = useAdminStore()
const email = ref('')

const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
})

function submit(): void {
  const params = new URLSearchParams({ return_to: returnTo.value })
  if (email.value.trim()) params.set('login_hint', email.value.trim())
  window.location.assign(`/auth/login?${params.toString()}`)
}
</script>

<template>
  <section class="login-layout">
    <div class="login-copy">
      <ShieldCheck :size="38" aria-hidden="true" />
      <span>SSO Admin</span>
      <h1>Secure operation console</h1>
      <p>Vue 3 admin surface with server-side OIDC boundary, encrypted httpOnly session, and controlled admin API access.</p>
    </div>

    <form class="login-panel" @submit.prevent="submit">
      <div class="login-panel__header">
        <KeyRound :size="22" aria-hidden="true" />
        <div>
          <h2>Admin login</h2>
          <p>Session broker remains on the backend.</p>
        </div>
      </div>

      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" placeholder="admin@example.com" />
      </label>

      <button class="button button--primary" type="submit">
        Continue
        <ArrowRight :size="18" aria-hidden="true" />
      </button>

      <RouterLink v-if="admin.isAuthenticated" class="button button--secondary" to="/dashboard">
        Open dashboard
      </RouterLink>
    </form>
  </section>
</template>
