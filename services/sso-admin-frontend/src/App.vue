<script setup lang="ts">
import { RouterView } from 'vue-router'
import UiToastProvider from '@/components/ui/UiToastProvider.vue'
</script>

<template>
  <RouterView />
  <UiToastProvider />
</template>
