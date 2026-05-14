<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AppWindow, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/web/components/PageHeader.vue'
import { useSessionStore } from '@/web/stores/session'

const session = useSessionStore()
const revokingId = ref<string | null>(null)
const error = ref<string | null>(null)

const apps = computed(() => session.connectedApps)

onMounted(() => session.loadConnectedApps())

async function revoke(clientId: string): Promise<void> {
  if (!confirm(`Cabut akses aplikasi ${clientId}? Semua sesi terkait akan dihentikan.`)) return
  revokingId.value = clientId
  error.value = null
  try {
    await session.revokeConnectedApp(clientId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal mencabut akses.'
  } finally {
    revokingId.value = null
  }
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('id-ID')
  } catch {
    return value
  }
}
</script>

<template>
  <section class="apps-view" aria-labelledby="apps-title">
    <PageHeader
      eyebrow="Otorisasi"
      title="Aplikasi Terhubung"
      description="Daftar aplikasi yang pernah kamu otorisasi lewat Dev-SSO. Cabut akses kapan saja untuk mengakhiri sesi OAuth di aplikasi tersebut."
    />

    <p v-if="apps.length === 0" class="empty-state">
      Belum ada aplikasi yang terhubung dengan akunmu.
    </p>

    <ul v-else class="apps-list" aria-label="Aplikasi terhubung">
      <li v-for="app in apps" :key="app.client_id" class="apps-item">
        <span class="apps-item__icon" aria-hidden="true">
          <AppWindow :size="22" />
        </span>
        <div class="apps-item__meta">
          <strong>{{ app.display_name }}</strong>
          <small>{{ app.client_id }}</small>
          <p>
            Terhubung sejak {{ formatDate(app.first_connected_at) }} · Terakhir dipakai
            {{ formatDate(app.last_used_at) }}
          </p>
        </div>
        <button
          type="button"
          class="button button--danger"
          :disabled="revokingId === app.client_id"
          @click="revoke(app.client_id)"
        >
          <Trash2 :size="14" aria-hidden="true" />
          {{ revokingId === app.client_id ? 'Memproses…' : 'Cabut Akses' }}
        </button>
      </li>
    </ul>

    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.apps-view {
  display: grid;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.empty-state,
.error-banner {
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px dashed var(--line, rgb(15 23 42 / 14%));
  color: var(--muted, #64748b);
  text-align: center;
}

.error-banner {
  border: 1px solid rgb(220 38 38 / 40%);
  color: #b91c1c;
  background: rgb(254 226 226 / 60%);
  text-align: left;
}

.apps-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.apps-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  background: rgb(255 255 255 / 88%);
}

.apps-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent, #2563eb) 14%, transparent);
  color: var(--accent, #2563eb);
}

.apps-item__meta strong {
  display: block;
  font-weight: 700;
}

.apps-item__meta small {
  display: block;
  font-size: 12px;
  color: var(--muted, #64748b);
  margin-top: 2px;
}

.apps-item__meta p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--muted, #64748b);
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
}

.button--danger {
  background: rgb(220 38 38 / 12%);
  color: #b91c1c;
  border-color: rgb(220 38 38 / 40%);
}

.button--danger:hover {
  background: rgb(220 38 38 / 18%);
}

.button--danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .apps-item {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .apps-item .button {
    grid-column: 1 / -1;
    justify-self: stretch;
    justify-content: center;
  }
}
</style>
