<script setup lang="ts">
import UiStatusView from '@/components/ui/UiStatusView.vue'
</script>

<template>
  <UiStatusView
    tone="error"
    eyebrow="Admin Frontend"
    title="Admin frontend belum bisa memuat status akses."
    description="Koneksi ke sesi admin atau admin API sedang bermasalah. Muat ulang halaman terlebih dahulu. Jika masalah berlanjut, lampirkan correlation ID dari response API atau network trace."
  >
    <template #actions>
      <a class="button button--primary" href="/">Muat ulang</a>
      <a class="button button--secondary" href="/home">Kembali ke Portal SSO</a>
    </template>
  </UiStatusView>
</template>
