<script setup lang="ts">
definePageMeta({
  name: 'admin.profile',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['profile.read'],
})
</script>

<template>
  <h1>Profile</h1>
</template>
