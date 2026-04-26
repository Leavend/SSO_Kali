<script setup lang="ts">
import { Layers } from 'lucide-vue-next'
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
  <section class="auth-screen" :aria-labelledby="labelledby">
    <main class="auth-card">
      <header class="brand-row">
        <span class="brand-mark" aria-hidden="true">
          <Layers :size="20" stroke-width="2.2" />
        </span>
        <span>
          <strong>{{ AUTH_SHELL.brand.name }}</strong>
          <small>{{ AUTH_SHELL.brand.tagline }}</small>
        </span>
      </header>

      <slot />
    </main>

    <div :id="AUTH_SHELL.theme.toggleHostId" :class="AUTH_SHELL.theme.toggleHostClass">
      <ThemeToggle />
    </div>

    <AuthFooter />
  </section>
</template>
