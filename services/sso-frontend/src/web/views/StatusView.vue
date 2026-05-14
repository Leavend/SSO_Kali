<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import AuthShell from "@/web/components/auth/AuthShell.vue";
import StatusPanel from "@/web/components/StatusPanel.vue";
import { GENERIC_ERROR_ROUTE, authStatusCopy } from "@shared/auth-status";

const route = useRoute();
const copy = computed(
  () => authStatusCopy[route.path] ?? authStatusCopy[GENERIC_ERROR_ROUTE],
);
</script>

<template>
  <AuthShell labelledby="status-title">
    <StatusPanel :copy="copy" />
  </AuthShell>
</template>
