<script setup lang="ts">
definePageMeta({
  name: 'admin.clients',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.read'],
})
</script>

<template>
  <h1>Clients</h1>
</template>
