<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { FileText, Shield, BookOpen } from 'lucide-vue-next'

const route = useRoute()

const content = computed(() => {
  if (route.name === 'privacy') return {
    title: 'Kebijakan Privasi',
    icon: Shield,
    body: 'Dev-SSO menjaga data sesi dan identitas sesuai prinsip minimisasi data. Hanya informasi yang diperlukan untuk autentikasi yang disimpan dan diproses.',
  }
  if (route.name === 'docs') return {
    title: 'Dokumentasi',
    icon: BookOpen,
    body: 'Dokumentasi operasional Dev-SSO tersedia untuk alur login, multi-factor authentication, integrasi client, dan panel administrasi.',
  }
  return {
    title: 'Ketentuan Layanan',
    icon: FileText,
    body: 'Akses Dev-SSO digunakan untuk autentikasi dan administrasi layanan yang berwenang. Setiap penggunaan tunduk pada kebijakan keamanan organisasi.',
  }
})
</script>

<template>
  <main class="legal-page">
    <section class="status-card" aria-labelledby="legal-title">
      <div class="legal-icon">
        <component :is="content.icon" :size="22" aria-hidden="true" />
      </div>
      <p class="eyebrow">Dev-SSO</p>
      <h1 id="legal-title">{{ content.title }}</h1>
      <p>{{ content.body }}</p>
      <RouterLink class="legal-back" to="/">Kembali ke Login</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.legal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: var(--accent);
  background: var(--accent-soft);
  margin-bottom: 8px;
}

.legal-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 28px;
  padding: 10px 18px;
  color: var(--accent);
  font-weight: 800;
  font-size: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-radius: 10px;
  background: var(--accent-soft);
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.legal-back:hover {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: var(--accent);
}
</style>
