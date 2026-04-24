<script setup lang="ts">
defineProps<{
  readonly label: string
  readonly value: string | number
  readonly detail?: string
}>()
</script>

<template>
  <article class="stat-tile">
    <span>{{ label }}</span>
    <strong>{{ value }}</strong>
    <small v-if="detail">{{ detail }}</small>
  </article>
</template>
