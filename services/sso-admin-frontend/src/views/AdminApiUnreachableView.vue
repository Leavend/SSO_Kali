<script setup lang="ts">
import UiStatusView from '@/components/ui/UiStatusView.vue'
</script>

<template>
  <UiStatusView
    tone="api"
    eyebrow="Admin API"
    title="Admin API tidak mengembalikan JSON yang valid."
    description="Panel admin menerima respons sukses yang tidak sesuai kontrak API. Penyebab paling umum adalah route proxy salah, backend tidak terjangkau, atau respons HTML dari upstream."
  >
    <template #actions>
      <a class="button button--primary" href="/">Muat ulang</a>
      <a class="button button--secondary" href="/healthz">Cek health</a>
    </template>
  </UiStatusView>
</template>
