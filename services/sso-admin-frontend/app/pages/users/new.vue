<script setup lang="ts">
definePageMeta({
  name: 'admin.users.create',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.write'],
})
</script>

<template>
  <h1>New user</h1>
</template>
