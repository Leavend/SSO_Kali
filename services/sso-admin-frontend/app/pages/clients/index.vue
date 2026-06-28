<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useClientsList } from '@/composables/useClientsList'
import { resolveClientStatusTone } from '@/lib/clients/clients-view-state'
import { CLIENT_STATUSES } from '@/types/clients.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import ClientsTable, { type ClientsTableRow } from '@/components/clients/ClientsTable.vue'

definePageMeta({
  name: 'admin.clients',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.clients.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens stay in Nitro event.context; the
// client_secret never enters a list DTO (only has_secret_hash) so nothing
// secret reaches useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-clients-principal', () => store.ensureSession())

// SAFE DATA: the list is fetched through the clientsApi service (no direct fetch
// in the page) and arrives as masked DTOs only. Search/filter/pagination are
// derived client-side over the hydrated list (the backend exposes no query params).
const {
  paged,
  viewState,
  requestId,
  total,
  filteredTotal,
  page,
  pageCount,
  query,
  statusFilter,
  isStale,
  refresh,
} = useClientsList()

const canCreate = computed<boolean>(() => store.hasPermission('admin.clients.write'))

function statusLabel(status: string): string {
  const path = `clients.status_${status}`
  const translated = t(path)
  return translated === path ? status : translated
}

// publik → category_public, kepegawaian → category_staff (existing keys); else raw.
function categoryLabel(category: string | null | undefined): string {
  if (category === 'publik') return t('clients.category_public')
  if (category === 'kepegawaian') return t('clients.category_staff')
  return category ?? '—'
}

const statusOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'all', label: t('clients.filter_all') },
  ...CLIENT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
])

const tableRows = computed<readonly ClientsTableRow[]>(() =>
  paged.value.map((client) => ({
    id: client.client_id,
    name: client.display_name ?? client.client_id,
    clientId: client.client_id,
    category: categoryLabel(client.category),
    status: statusLabel(client.status ?? '—'),
    statusTone: resolveClientStatusTone(client.status),
  })),
)

function onSelect(clientId: string): void {
  void navigateTo({ name: 'admin.clients.detail', params: { clientId } })
}

function onNext(): void {
  if (page.value < pageCount.value) page.value += 1
}

function onPrevious(): void {
  if (page.value > 1) page.value -= 1
}

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="clients" data-page="clients">
    <header class="clients__hero">
      <span class="clients__eyebrow">{{ t('clients.eyebrow') }}</span>
      <div class="clients__heading">
        <div class="clients__heading-text">
          <h1 class="clients__title">{{ t('clients.title') }}</h1>
          <p class="clients__summary">{{ t('clients.summary') }}</p>
          <p class="clients__principal" data-principal-name>
            {{ t('clients.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <NuxtLink
          v-if="canCreate"
          :to="{ name: 'admin.clients.create' }"
          class="clients__create"
          data-test="clients-create"
        >
          <UiButton variant="primary" size="sm">{{ t('clients.btn_create_client') }}</UiButton>
        </NuxtLink>
      </div>
      <dl v-if="total > 0" class="clients__evidence">
        <dt>{{ t('clients.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('clients.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('clients.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('clients.eyebrow')"
      :title="t('clients.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-test="clients-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('clients.empty_title')"
      :description="t('clients.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="clients__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="clients__controls">
        <UiInput
          v-model="query"
          class="clients__search"
          :placeholder="t('clients.search_placeholder')"
          :aria-label="t('clients.search_label')"
        />
        <UiSelect
          v-model="statusFilter"
          class="clients__filter"
          :options="statusOptions"
          :aria-label="t('clients.filter_status')"
        />
      </div>

      <ClientsTable
        :caption="t('clients.title')"
        :name-label="t('clients.col_client')"
        :client-id-label="t('clients.col_client_id')"
        :category-label="t('clients.col_category')"
        :status-label="t('clients.col_status')"
        :view-label="t('clients.btn_view')"
        :rows="tableRows"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('clients.page_next')"
        :previous-label="t('clients.page_previous')"
        @select="onSelect"
        @next="onNext"
        @previous="onPrevious"
      />
    </template>
  </section>
</template>

<style scoped>
.clients {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.clients__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.clients__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.clients__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.clients__heading-text {
  display: grid;
  gap: 6px;
}
.clients__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.clients__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.clients__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.clients__create {
  flex: none;
  text-decoration: none;
}
.clients__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.clients__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.clients__evidence dd {
  margin: 0;
}
.clients__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-fg);
  border-radius: var(--r-sm);
}
.clients__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.clients__search {
  flex: 1 1 280px;
}
.clients__filter {
  flex: 0 1 220px;
}
</style>
