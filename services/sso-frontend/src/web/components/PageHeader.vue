<script setup lang="ts">
defineProps<{
  readonly eyebrow: string
  readonly title: string
  readonly description?: string
}>()
</script>

<template>
  <header class="page-header">
    <span aria-hidden="true">{{ eyebrow }}</span>
    <h1 :id="`${eyebrow.toLowerCase().replace(/\s+/g, '-')}-title`">{{ title }}</h1>
    <p v-if="description">{{ description }}</p>
  </header>
</template>
