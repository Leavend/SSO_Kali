<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Inbox, RefreshCw, Trash2 } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import FilterBar from '@/components/ui/FilterBar.vue'
import BulkActionBar from '@/components/ui/BulkActionBar.vue'
import SlideOver from '@/components/ui/SlideOver.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, truncateId } from '@shared/format'

const admin = useAdminStore()
const isLoading = computed(() => admin.status === 'loading')

const searchQuery = ref('')

const selectedSessions = ref<string[]>([])
const sessionDetailOpen = ref(false)
const selectedSession = ref<typeof admin.sessions[0] | null>(null)
const revokeConfirmOpen = ref(false)
const bulkRevokeConfirmOpen = ref(false)
const sessionBulkActions = [
  { label: 'Cabut Sesi', icon: Trash2, variant: 'danger' as const, action: 'revoke' },
]

const clientOptions = computed(() => {
  const clients = new Set(admin.sessions.map(s => s.client_id))
  return Array.from(clients).map(c => ({ value: c, label: c }))
})

const filters = ref([
  {
    key: 'client',
    label: 'Client',
    options: [] as { value: string; label: string }[],
    selected: [] as string[],
  },
])

watch(clientOptions, (newOptions) => {
  filters.value[0].options = newOptions
}, { immediate: true })

const filteredSessions = computed(() => {
  let result = [...admin.sessions]

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(session =>
      session.display_name.toLowerCase().includes(query) ||
      session.email.toLowerCase().includes(query) ||
      session.client_id.toLowerCase().includes(query) ||
      session.session_id.toLowerCase().includes(query)
    )
  }

  if (filters.value[0].selected.length > 0) {
    result = result.filter(session =>
      filters.value[0].selected.includes(session.client_id)
    )
  }

  return result
})

onMounted(() => {
  admin.loadSessions()
})

function handleSearch(value: string) {
  searchQuery.value = value
}

function handleFilterUpdate(newFilters: Record<string, string[]>) {
  filters.value[0].selected = newFilters.client ?? []
}

function openSessionDetail(session: typeof admin.sessions[0]) {
  selectedSession.value = session
  sessionDetailOpen.value = true
}

async function handleRevokeSession(sessionId: string) {
  try {
    await admin.revokeSession(sessionId)
  } catch (error) {
    console.error('Failed to revoke session:', error)
  }
  revokeConfirmOpen.value = false
  sessionDetailOpen.value = false
}

async function handleBulkRevoke() {
  const sessionIds = [...selectedSessions.value]

  try {
    await Promise.all(sessionIds.map((sessionId) => admin.revokeSession(sessionId)))
    selectedSessions.value = []
  } catch (error) {
    console.error('Failed to revoke selected sessions:', error)
  } finally {
    bulkRevokeConfirmOpen.value = false
  }
}

function confirmRevokeSession(session: typeof admin.sessions[0]) {
  selectedSession.value = session
  revokeConfirmOpen.value = true
}

function isSessionSelected(sessionId: string) {
  return selectedSessions.value.includes(sessionId)
}

function toggleSessionSelection(sessionId: string) {
  if (isSessionSelected(sessionId)) {
    selectedSessions.value = selectedSessions.value.filter(id => id !== sessionId)
    return
  }

  selectedSessions.value = [...selectedSessions.value, sessionId]
}
</script>

<template>
  <section class="content-stack" aria-labelledby="runtime-title">
    <PageHeader
      eyebrow="Runtime"
      title="Sessions"
      description="Sesi SSO aktif yang bisa dicabut oleh administrator."
    />

    <div class="toolbar" role="toolbar" aria-label="Aksi sesi">
      <button
        class="button button--secondary"
        type="button"
        :disabled="isLoading"
        :aria-busy="isLoading"
        @click="admin.loadSessions"
      >
        <RefreshCw :size="18" aria-hidden="true" :class="{ 'animate-spin': isLoading }" />
        Refresh
      </button>
    </div>

    <FilterBar
      :filters="filters"
      search-placeholder="Cari sesi..."
      @update:search="handleSearch"
      @update:filters="handleFilterUpdate"
    />

    <BulkActionBar
      v-if="admin.canManageSessions"
      :selected-count="selectedSessions.length"
      :actions="sessionBulkActions"
      @action="bulkRevokeConfirmOpen = true"
      @clear="selectedSessions = []"
    />

    <!-- Loading skeleton -->
    <div v-if="isLoading" class="sessions-list" aria-busy="true" aria-label="Memuat sesi">
      <article class="session-card session-card--skeleton" v-for="n in 3" :key="n" aria-hidden="true">
        <div class="session-card__main">
          <div class="session-card__identity">
            <span class="skeleton skeleton--text skeleton--eyebrow" />
            <span class="skeleton skeleton--text skeleton--name" />
            <span class="skeleton skeleton--text skeleton--email" />
          </div>
          <div class="session-card__meta">
            <span class="skeleton skeleton--detail" v-for="m in 3" :key="m" />
          </div>
        </div>
        <div class="session-card__actions">
          <span class="skeleton skeleton--button" />
          <span class="skeleton skeleton--button skeleton--button-danger" />
        </div>
      </article>
    </div>

    <div v-else-if="filteredSessions.length > 0" class="sessions-list" role="list" aria-label="Daftar sesi aktif">
      <article
        v-for="session in filteredSessions"
        :key="`${session.session_id}:${session.client_id}`"
        class="session-card"
        :class="{ 'session-card--readonly': !admin.canManageSessions }"
        role="listitem"
        :aria-label="`Sesi aktif ${session.display_name} untuk ${session.client_id}`"
      >
        <label v-if="admin.canManageSessions" class="session-card__select">
          <input
            type="checkbox"
            :aria-label="`Pilih sesi ${session.display_name}`"
            :checked="isSessionSelected(session.session_id)"
            @change="toggleSessionSelection(session.session_id)"
          />
        </label>

        <div class="session-card__main">
          <div class="session-card__identity">
            <span class="session-card__eyebrow">Pengguna aktif</span>
            <h2>{{ session.display_name }}</h2>
            <p>{{ session.email }}</p>
          </div>

          <dl class="session-card__meta" aria-label="Detail sesi">
            <div class="session-detail session-detail--client">
              <dt>Client</dt>
              <dd>{{ session.client_id }}</dd>
            </div>
            <div class="session-detail">
              <dt>Kedaluwarsa</dt>
              <dd>{{ formatDateTime(session.expires_at) }}</dd>
            </div>
            <div class="session-detail session-detail--mono">
              <dt>Session ID</dt>
              <dd>{{ truncateId(session.session_id) }}</dd>
            </div>
          </dl>
        </div>

        <div class="session-card__actions">
          <button
            class="button button--secondary button--sm"
            type="button"
            aria-label="Detail sesi"
            @click="openSessionDetail(session)"
          >
            Detail
          </button>
          <button
            v-if="admin.canManageSessions"
            class="button button--danger session-card__revoke"
            type="button"
            :aria-label="`Cabut sesi milik ${session.display_name}`"
            @click="confirmRevokeSession(session)"
          >
            <Trash2 :size="16" aria-hidden="true" />
            Cabut
          </button>
        </div>
      </article>
    </div>

    <div v-else class="panel-empty--large" role="status">
      <Inbox :size="32" aria-hidden="true" />
      <h3>Tidak ada sesi aktif</h3>
      <p>Sesi akan muncul setelah pengguna melakukan login melalui SSO.</p>
    </div>

    <SlideOver
      v-model="sessionDetailOpen"
      :title="`Sesi: ${selectedSession?.display_name ?? ''}`"
      size="md"
    >
      <template v-if="selectedSession">
        <div class="session-detail-grid">
          <div class="detail-item">
            <dt>Email</dt>
            <dd>{{ selectedSession.email }}</dd>
          </div>
          <div class="detail-item">
            <dt>Client ID</dt>
            <dd>{{ selectedSession.client_id }}</dd>
          </div>
          <div class="detail-item">
            <dt>Subject ID</dt>
            <dd>{{ selectedSession.subject_id }}</dd>
          </div>
          <div class="detail-item">
            <dt>Kedaluwarsa</dt>
            <dd>{{ formatDateTime(selectedSession.expires_at) }}</dd>
          </div>
          <div class="detail-item detail-item--full">
            <dt>Session ID</dt>
            <dd class="mono">{{ selectedSession.session_id }}</dd>
          </div>
        </div>
      </template>

      <template #footer>
        <button
          v-if="admin.canManageSessions"
          class="button button--danger"
          type="button"
          @click="revokeConfirmOpen = true"
        >
          Cabut Sesi
        </button>
        <button
          class="button button--secondary"
          type="button"
          @click="sessionDetailOpen = false"
        >
          Tutup
        </button>
      </template>
    </SlideOver>

    <ConfirmDialog
      v-model="revokeConfirmOpen"
      title="Cabut Sesi?"
      :message="`Apakah Anda yakin ingin mencabut sesi milik ${selectedSession?.display_name}? Tindakan ini tidak dapat dibatalkan.`"
      confirm-label="Ya, Cabut"
      cancel-label="Batal"
      danger
      @confirm="selectedSession && handleRevokeSession(selectedSession.session_id)"
    />

    <ConfirmDialog
      v-model="bulkRevokeConfirmOpen"
      title="Cabut Sesi Terpilih?"
      :message="`Apakah Anda yakin ingin mencabut ${selectedSessions.length} sesi terpilih? Pengguna terdampak perlu login ulang.`"
      confirm-label="Ya, Cabut Sesi"
      cancel-label="Batal"
      danger
      @confirm="handleBulkRevoke"
    />
  </section>
</template>

<style scoped>
.sessions-list {
  display: grid;
  gap: var(--space-4);
}

.session-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: stretch;
  gap: var(--space-5);
  padding: var(--space-5);
  background: linear-gradient(135deg, var(--admin-panel) 0%, color-mix(in srgb, var(--admin-accent-soft) 5%, var(--admin-panel)) 100%);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px var(--admin-shadow);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s ease;
}

.session-card:hover:not(.session-card--skeleton) {
  box-shadow: 0 8px 24px var(--admin-shadow-md);
  border-color: var(--admin-line-strong);
}

.session-card--skeleton {
  pointer-events: none;
}

.session-card__select {
  display: inline-flex;
  align-items: flex-start;
  padding-top: var(--space-1);
}

.session-card__select input {
  width: 20px;
  height: 20px;
  accent-color: var(--admin-accent);
  cursor: pointer;
}

.session-card__main {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.session-card__identity {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.session-card__eyebrow {
  color: var(--admin-accent);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.session-card__identity h2 {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-xl);
  font-weight: 800;
  letter-spacing: 0;
  line-height: var(--leading-tight);
}

.session-card__identity p {
  margin: 0;
  color: var(--admin-muted);
  font-size: var(--text-sm);
}

.session-card__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.session-detail {
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: var(--space-3);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.session-card:hover .session-detail {
  background: color-mix(in srgb, var(--admin-accent-soft) 30%, var(--admin-panel-muted));
  border-color: var(--admin-line-strong);
}

.session-detail dt {
  color: var(--admin-subtle);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.session-detail dd {
  margin: 0;
  color: var(--admin-ink-secondary);
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: var(--leading-normal);
}

.session-detail--client dd {
  color: var(--admin-accent);
}

.session-detail--mono dd {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.session-card__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
  justify-content: center;
  padding-left: var(--space-5);
  border-left: 1px solid var(--admin-line);
}

.session-card__revoke {
  white-space: nowrap;
}

.session-card--readonly {
  grid-template-columns: 1fr auto;
}

.session-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.detail-item {
  display: grid;
  gap: var(--space-1);
}

.detail-item dt {
  color: var(--admin-subtle);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
}

.detail-item dd {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-sm);
  word-break: break-all;
}

.detail-item--full {
  grid-column: 1 / -1;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

/* Skeleton loading states */
.skeleton {
  display: block;
  background: linear-gradient(90deg,
    var(--admin-panel-muted) 0%,
    var(--admin-panel-hover) 50%,
    var(--admin-panel-muted) 100%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.5s ease-in-out infinite;
}

.skeleton--eyebrow {
  width: 80px;
  height: 12px;
}

.skeleton--name {
  width: 180px;
  height: 22px;
}

.skeleton--email {
  width: 240px;
  height: 13px;
}

.skeleton--detail {
  width: 100%;
  height: 64px;
  border-radius: var(--radius-md);
}

.skeleton--button {
  width: 72px;
  height: 36px;
  border-radius: var(--radius-md);
}

.skeleton--button-danger {
  width: 88px;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (max-width: 768px) {
  .session-card {
    grid-template-columns: auto 1fr;
  }

  .session-card__actions {
    grid-column: 1 / -1;
    flex-direction: row;
    padding-left: 0;
    padding-top: var(--space-4);
    border-left: none;
    border-top: 1px solid var(--admin-line);
  }

  .session-card__revoke {
    width: 100%;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .session-card {
    transition: none;
  }

  .session-card:hover:not(.session-card--skeleton) {
    box-shadow: 0 1px 3px var(--admin-shadow);
  }

  .session-detail {
    transition: none;
  }

  .skeleton {
    animation: none;
    background: var(--admin-panel-muted);
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .session-card {
    border-width: 2px;
  }

  .session-card:hover:not(.session-card--skeleton) {
    border-color: var(--admin-accent);
  }

  .session-detail {
    border-width: 2px;
  }

  .session-card__actions {
    border-left-width: 2px;
  }
}
</style>
