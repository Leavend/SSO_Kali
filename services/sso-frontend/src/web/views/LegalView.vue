<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const content = computed(() => {
  if (route.name === 'privacy') return { title: 'Privacy', body: 'Dev-SSO menjaga data sesi dan identitas sesuai prinsip minimisasi data.' }
  if (route.name === 'docs') return { title: 'Docs', body: 'Dokumentasi operasional Dev-SSO tersedia untuk alur login, MFA, dan admin panel.' }
  return { title: 'Terms', body: 'Akses Dev-SSO digunakan untuk autentikasi dan administrasi layanan yang berwenang.' }
})
</script>

<template>
  <main class="legal-page">
    <section class="status-card" aria-labelledby="legal-title">
      <p class="eyebrow">Dev-SSO</p>
      <h1 id="legal-title">{{ content.title }}</h1>
      <p>{{ content.body }}</p>
      <RouterLink to="/">Kembali ke Login</RouterLink>
    </section>
  </main>
</template>
