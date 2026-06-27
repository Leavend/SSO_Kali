<script setup lang="ts">
definePageMeta({
  name: 'admin.dashboard',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})
</script>

<template>
  <h1>Dashboard</h1>
</template>
