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
  <section class="legacy-login" :aria-labelledby="labelledby">
    <div class="legacy-login__frame">
      <header class="legacy-login__header">
        <span class="legacy-login__mark" aria-hidden="true">
          <Layers :size="20" stroke-width="2.2" />
        </span>
        <p>{{ AUTH_SHELL.brand.name }}</p>
      </header>

      <slot />
    </div>

    <div :id="AUTH_SHELL.theme.toggleHostId" :class="AUTH_SHELL.theme.toggleHostClass">
      <ThemeToggle />
    </div>

    <AuthFooter />
  </section>
</template>
