<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
</script>

<template>
  <section class="status-panel" aria-labelledby="not-found-title">
    <div class="status-panel__icon">
      <AlertTriangle :size="28" aria-hidden="true" />
    </div>
    <span class="status-badge">404</span>
    <h1 id="not-found-title">Halaman tidak ditemukan</h1>
    <p>Route ini tidak terdaftar di panel admin. Periksa URL atau kembali ke dashboard.</p>
    <div class="status-panel__actions">
      <RouterLink class="button button--primary" to="/dashboard">Buka Dashboard</RouterLink>
      <RouterLink class="button button--secondary" to="/">Halaman Utama</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.status-panel {
  display: grid;
  gap: 8px;
  max-width: 560px;
  padding: 48px 32px;
  text-align: center;
  justify-items: center;
}

.status-panel__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  color: var(--admin-accent, var(--accent));
  background: color-mix(in srgb, var(--admin-accent, var(--accent)) 14%, transparent);
  margin-bottom: 8px;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--admin-accent, var(--accent));
  background: color-mix(in srgb, var(--admin-accent, var(--accent)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--admin-accent, var(--accent)) 24%, transparent);
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status-panel h1 {
  margin: 8px 0 0;
  font-size: 32px;
  font-weight: 800;
  line-height: 1.15;
}

.status-panel p {
  margin: 4px 0 0;
  max-width: 420px;
  color: var(--admin-muted, var(--muted));
  font-size: 15px;
  line-height: 1.6;
}

.status-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
</style>
