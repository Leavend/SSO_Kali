<script setup lang="ts">
definePageMeta({
  name: 'admin.users',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.read'],
})
</script>

<template>
  <h1>Users</h1>
</template>
