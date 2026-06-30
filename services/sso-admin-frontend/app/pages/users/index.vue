<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useUsersList } from '@/composables/useUsersList'
import { resolveUserStatusTone } from '@/lib/users/users-view-state'
import { USER_ACCOUNT_STATUSES } from '@/types/users.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UsersTable, { type UsersTableRow } from '@/components/users/UsersTable.vue'

definePageMeta({
  name: 'admin.users',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.users.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side (display name, role,
// capability flags only). OIDC tokens + raw government PII stay in Nitro
// event.context and are never written to useState / __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-users-principal', () => store.ensureSession())

// SAFE DATA: the list is fetched through the usersApi service (no direct fetch in
// the page) and arrives as masked DTOs only. Search/filter/pagination are derived
// client-side over the hydrated list (the backend exposes no query params).
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
} = useUsersList()

const canCreate = computed<boolean>(() => store.hasPermission('admin.users.write'))

function statusLabel(status: string): string {
  const path = `users.status_${status}`
  const translated = t(path)
  return translated === path ? status : translated
}

const statusOptions = computed<readonly UiSelectOption[]>(() => [
  { value: 'all', label: t('users.filter_all') },
  ...USER_ACCOUNT_STATUSES.map((status) => ({ value: status, label: statusLabel(status) })),
])

const tableRows = computed<readonly UsersTableRow[]>(() =>
  paged.value.map((user) => ({
    id: user.subject_id,
    displayName: user.display_name ?? user.email,
    email: user.email,
    role: user.role ?? '—',
    status: statusLabel(user.effective_status),
    statusTone: resolveUserStatusTone(user.effective_status),
  })),
)

function onSelect(subjectId: string): void {
  void navigateTo({ name: 'admin.users.detail', params: { subjectId } })
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
  <section class="users" data-page="users">
    <header class="users__hero">
      <span class="users__eyebrow">{{ t('users.eyebrow') }}</span>
      <div class="users__heading">
        <div class="users__heading-text">
          <h1 class="users__title">{{ t('users.title') }}</h1>
          <p class="users__summary">{{ t('users.summary') }}</p>
          <p class="users__principal" data-principal-name>
            {{ t('users.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
          </p>
        </div>
        <NuxtLink
          v-if="canCreate"
          :to="{ name: 'admin.users.create' }"
          class="users__create"
          data-test="users-create"
        >
          <UiButton variant="primary" size="sm">{{ t('users.btn_create_user') }}</UiButton>
        </NuxtLink>
      </div>
      <dl v-if="total > 0" class="users__evidence">
        <dt>{{ t('users.title') }}</dt>
        <dd><UiFolio :index="filteredTotal" :total="total" /></dd>
      </dl>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="6" :label="t('users.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('users.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('users.eyebrow')"
      :title="t('users.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-test="users-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <UiEmptyState
      v-else-if="viewState === 'empty'"
      :title="t('users.empty_title')"
      :description="t('users.empty_desc')"
    >
      <template #action>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <div v-if="isStale" class="users__banner" role="status">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ t('common.error_loading_desc') }}</span>
      </div>

      <div class="users__controls">
        <UiInput
          v-model="query"
          class="users__search"
          :placeholder="t('users.search_placeholder')"
          :aria-label="t('users.label_search')"
        />
        <UiSelect
          v-model="statusFilter"
          class="users__filter"
          :options="statusOptions"
          :aria-label="t('users.filter_status')"
        />
      </div>

      <UsersTable
        :caption="t('users.title')"
        :user-label="t('users.col_user')"
        :email-label="t('users.col_email')"
        :role-label="t('users.label_role')"
        :status-label="t('users.col_status')"
        :view-label="t('users.col_view')"
        :rows="tableRows"
        :total="filteredTotal"
        :page="page"
        :page-count="pageCount"
        :next-label="t('users.page_next')"
        :previous-label="t('users.page_previous')"
        @select="onSelect"
        @next="onNext"
        @previous="onPrevious"
      />
    </template>
  </section>
</template>

<style scoped>
.users {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.users__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.users__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.users__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.users__heading-text {
  display: grid;
  gap: 6px;
}
.users__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.users__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.users__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.users__create {
  flex: none;
  text-decoration: none;
}
.users__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}
.users__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.users__evidence dd {
  margin: 0;
}
.users__banner {
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
.users__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.users__search {
  flex: 1 1 280px;
}
.users__filter {
  flex: 0 1 220px;
}
</style>
