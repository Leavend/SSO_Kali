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
    <div
      :id="AUTH_SHELL.theme.toggleHostId"
      :class="AUTH_SHELL.theme.toggleHostClass"
    >
      <ThemeToggle />
    </div>

    <div class="legacy-login__frame">
      <div class="legacy-login__header">
        <div class="legacy-login__mark" aria-hidden="true">
          <Layers :size="20" stroke-width="2.2" />
        </div>
        <p>{{ AUTH_SHELL.brand.name }}</p>
      </div>

      <slot />
    </div>

    <AuthFooter />
  </section>
</template>
