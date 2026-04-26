<script setup lang="ts">
import { AUTH_SHELL } from '@parent-ui/auth-shell.mjs'
</script>

<template>
  <footer class="auth-footer" aria-label="Legal links">
    <span>{{ AUTH_SHELL.footer.copyright }}</span>
    <template v-for="link in AUTH_SHELL.footer.links" :key="link.label">
      <span aria-hidden="true">{{ AUTH_SHELL.footer.separator }}</span>
      <a :href="link.href">{{ link.label }}</a>
    </template>
  </footer>
</template>
