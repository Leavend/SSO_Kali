<script setup lang="ts">
definePageMeta({
  name: 'admin.policy',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.security-policy.read'],
})
</script>

<template>
  <h1>Security policy</h1>
</template>
