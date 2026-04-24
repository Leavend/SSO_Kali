<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import StatusPanel from '@/components/StatusPanel.vue'
import { GENERIC_ERROR_ROUTE, authStatusCopy } from '@shared/auth-status'

const route = useRoute()
const copy = computed(() => authStatusCopy[route.path] ?? authStatusCopy[GENERIC_ERROR_ROUTE])
</script>

<template>
  <StatusPanel :copy="copy" />
</template>
