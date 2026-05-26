<script setup lang="ts">
defineProps<{
  readonly title: string
  readonly message: string
}>()
</script>

<template>
  <section class="oidc-panel" role="status" aria-live="polite">
    <h2>{{ title }}</h2>
    <p>{{ message }}</p>
  </section>
</template>
