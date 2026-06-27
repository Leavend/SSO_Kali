<script setup lang="ts">
definePageMeta({
  name: 'admin.sessions',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.sessions.terminate'],
})
</script>

<template>
  <h1>Sessions</h1>
</template>
