<script setup lang="ts">
defineProps<{
  readonly eyebrow: string
  readonly title: string
  readonly description?: string
}>()
</script>

<template>
  <header class="page-header">
    <span>{{ eyebrow }}</span>
    <h1>{{ title }}</h1>
    <p v-if="description">{{ description }}</p>
  </header>
</template>
