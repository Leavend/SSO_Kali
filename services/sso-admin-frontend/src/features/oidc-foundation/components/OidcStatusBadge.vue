<script setup lang="ts">
defineProps<{
  readonly status: string
}>()
</script>

<template>
  <span class="oidc-status-badge" :data-status="status">
    {{ status }}
  </span>
</template>
