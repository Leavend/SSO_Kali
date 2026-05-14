<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, LogOut, Monitor, Trash2 } from 'lucide-vue-next'
import PageHeader from '../components/PageHeader.vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const revokingId = ref<string | null>(null)
const loggingOut = ref(false)
const error = ref<string | null>(null)

const sessions = computed(() => session.mySessions)

onMounted(() => session.loadMySessions())

async function revoke(sessionId: string): Promise<void> {
  if (!confirm('Akhiri sesi ini? Perangkat yang menggunakannya akan dipaksa logout.')) return
  revokingId.value = sessionId
  error.value = null
  try {
    await session.revokeMySession(sessionId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal mencabut sesi.'
  } finally {
    revokingId.value = null
  }
}

async function logoutAll(): Promise<void> {
  if (!confirm('Logout dari semua perangkat dan aplikasi?')) return
  loggingOut.value = true
  try {
    await session.logoutEverywhere()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Gagal logout global.'
  } finally {
    loggingOut.value = false
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
  <section class="sessions-view" aria-labelledby="sessions-title">
    <PageHeader
      eyebrow="Keamanan"
      title="Sesi Aktif"
      description="Daftar sesi login yang sedang aktif. Kamu bisa mengakhiri sesi tertentu atau semua sesi sekaligus."
    />

    <div class="sessions-toolbar">
      <button
        type="button"
        class="button button--outline"
        :disabled="loggingOut || sessions.length === 0"
        @click="logoutAll"
      >
        <LogOut :size="16" aria-hidden="true" />
        {{ loggingOut ? 'Memproses…' : 'Logout Semua Perangkat' }}
      </button>
    </div>

    <p v-if="sessions.length === 0" class="empty-state">
      Tidak ada sesi aktif selain yang sedang kamu pakai sekarang.
    </p>

    <ul v-else class="sessions-list" aria-label="Sesi aktif">
      <li
        v-for="item in sessions"
        :key="item.session_id"
        data-testid="my-session-item"
        class="sessions-item grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-4"
      >
        <span
          data-testid="my-session-icon"
          class="sessions-item__icon self-center justify-self-center"
          aria-hidden="true"
        >
          <Monitor :size="20" />
        </span>
        <div data-testid="my-session-meta" class="sessions-item__meta min-w-0">
          <strong class="truncate">Sesi {{ item.session_id }}</strong>
          <small data-testid="my-session-client-names" class="truncate">
            {{ item.client_count }} aplikasi · {{ item.client_display_names.join(', ') }}
          </small>
          <p data-testid="my-session-activity" class="truncate">
            Dibuka {{ formatDate(item.opened_at) }} · Terakhir aktif {{ formatDate(item.last_used_at) }} · Berakhir
            {{ formatDate(item.expires_at) }}
          </p>
        </div>
        <button
          type="button"
          data-testid="my-session-revoke-button"
          class="button button--danger size-10 shrink-0 justify-self-end px-0 sm:w-fit sm:px-3"
          :disabled="revokingId === item.session_id"
          :aria-label="`Cabut sesi ${item.session_id}`"
          @click="revoke(item.session_id)"
        >
          <Trash2 :size="14" aria-hidden="true" />
          <span data-testid="my-session-revoke-label" class="sr-only sm:not-sr-only">
            {{ revokingId === item.session_id ? 'Memproses…' : 'Cabut Sesi' }}
          </span>
        </button>
      </li>
    </ul>

    <p v-if="error" class="error-banner" role="alert">
      <Activity :size="16" aria-hidden="true" />
      {{ error }}
    </p>
  </section>
</template>

<style scoped>
.sessions-view {
  display: grid;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.sessions-toolbar {
  display: flex;
  justify-content: flex-end;
}

.empty-state,
.error-banner {
  padding: 18px 20px;
  border-radius: 14px;
  border: 1px dashed var(--line, rgb(15 23 42 / 14%));
  color: var(--muted, #64748b);
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.error-banner {
  border: 1px solid rgb(220 38 38 / 40%);
  color: #b91c1c;
  background: rgb(254 226 226 / 60%);
}

.sessions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 12px;
}

.sessions-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid var(--line, rgb(15 23 42 / 8%));
  background: rgb(255 255 255 / 88%);
}

.sessions-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent, #2563eb) 14%, transparent);
  color: var(--accent, #2563eb);
}

.sessions-item__meta strong {
  display: block;
  font-weight: 700;
}

.sessions-item__meta small {
  display: block;
  font-size: 12px;
  color: var(--muted, #64748b);
  margin-top: 2px;
}

.sessions-item__meta p {
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
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
}

.button--outline {
  border-color: var(--line, rgb(15 23 42 / 14%));
  color: var(--ink, #0f172a);
}

.button--outline:hover {
  border-color: var(--accent, #2563eb);
  color: var(--accent, #2563eb);
}

.button--danger {
  background: rgb(220 38 38 / 12%);
  color: #b91c1c;
  border-color: rgb(220 38 38 / 40%);
}

.button--danger:hover {
  background: rgb(220 38 38 / 18%);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .sessions-toolbar .button {
    width: 100%;
    justify-content: center;
  }
}
</style>
