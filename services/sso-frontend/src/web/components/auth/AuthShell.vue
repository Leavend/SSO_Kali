<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
import { AUTH_SHELL } from '@parent-ui/auth-shell.mjs'
import ThemeToggle from '@/components/ThemeToggle.vue'
import AuthFooter from './AuthFooter.vue'

withDefaults(
  defineProps<{
    labelledby?: string
  }>(),
  {
    labelledby: 'login-title',
  },
)
</script>

<template>
  <section class="legacy-login" :aria-labelledby="labelledby">
    <div class="legacy-login__frame">
      <header class="legacy-login__header">
        <div class="legacy-login__mark" aria-hidden="true">
          <ShieldCheck :size="22" stroke-width="2" />
        </div>
        <div class="legacy-login__brand">
          <p class="legacy-login__name">{{ AUTH_SHELL.brand.name }}</p>
          <p class="legacy-login__subtitle">{{ AUTH_SHELL.brand.subtitle }}</p>
        </div>
      </header>

      <slot />
    </div>

    <div
      :id="AUTH_SHELL.theme.toggleHostId"
      :class="AUTH_SHELL.theme.toggleHostClass"
    >
      <ThemeToggle />
    </div>

    <AuthFooter />
  </section>
</template>
