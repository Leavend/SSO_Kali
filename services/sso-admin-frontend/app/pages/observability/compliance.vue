<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useRetentionStatus } from '@/composables/useRetentionStatus'
import { useDataSubjectRequests } from '@/composables/useDataSubjectRequests'
import type { ComplianceViewState } from '@/lib/compliance/compliance-view-state'
import type { DataSubjectRequest, DsrStatus, RetentionItem } from '@/types/compliance.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiDataList, {
  type UiDataListColumn,
  type UiDataListRow,
} from '@/components/ui/UiDataList.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDetailDrawer from '@/components/ui/UiDetailDrawer.vue'
import ComplianceExportPanel from '@/components/compliance/ComplianceExportPanel.vue'
import DsrQueueTable from '@/components/compliance/DsrQueueTable.vue'
import DsrReviewActions from '@/components/compliance/DsrReviewActions.vue'

definePageMeta({
  name: 'admin.observability.compliance',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.observability.read'],
})

const { t } = useI18n()

// SAFE HYDRATION: resolve the masked principal server-side via the session store.
// OIDC tokens + raw government PII stay in Nitro event.context, never in __NUXT__.
const store = useSessionStore()
await useAsyncData('admin-compliance-principal', () => store.ensureSession())

// SAFE DATA: retention + DSR DTOs are masked aggregates / opaque ids only.
const retention = useRetentionStatus()
const dsr = useDataSubjectRequests()

const canExport = computed<boolean>(() => store.hasPermission('admin.audit.export'))
const canReview = computed<boolean>(() => store.hasPermission('admin.dsr.review'))

// Both reads share admin.observability.read at the route, so a security/transport
// failure on either drives the page-level surface; otherwise each panel degrades
// independently (empty / stale / error) inside the ready workspace.
// ponytail: plain precedence over two view-states — no resolver needed for 2 inputs.
const pageState = computed<ComplianceViewState>(() => {
  const states = [retention.viewState.value, dsr.viewState.value]
  if (states.includes('loading')) return 'loading'
  if (states.includes('unauthenticated')) return 'unauthenticated'
  if (states.includes('forbidden')) return 'forbidden'
  if (states.every((state) => state === 'error')) return 'error'
  return 'ready'
})
const pageRequestId = computed<string | null>(
  () => retention.requestId.value ?? dsr.requestId.value,
)

// --- retention panel ---
const retentionColumns: readonly UiDataListColumn[] = [
  { key: 'label', label: t('observability.compliance.retention.category') },
  { key: 'window', label: t('observability.compliance.retention.window') },
  { key: 'schedule', label: t('observability.compliance.retention.schedule') },
  {
    key: 'last_pruned',
    label: t('observability.compliance.retention.last_pruned'),
    variant: 'timestamp',
  },
  {
    key: 'candidate',
    label: t('observability.compliance.retention.candidate_rows'),
    align: 'right',
  },
]

function windowLabel(item: RetentionItem): string {
  const { days, hours, seconds } = item.window
  if (typeof days === 'number') return `${days}d`
  if (typeof hours === 'number') return `${hours}h`
  if (typeof seconds === 'number') return `${seconds}s`
  return '—'
}

const retentionRows = computed<readonly UiDataListRow[]>(() =>
  (retention.retention.value?.items ?? []).map((item) => ({
    id: item.category,
    label: item.label,
    window: windowLabel(item),
    schedule: item.schedule ?? '—',
    last_pruned: item.last_pruned_at ?? t('observability.compliance.retention.not_pruned'),
    candidate: item.candidate_count ?? 0,
  })),
)

// --- DSR controls ---
const dsrStatuses: readonly (DsrStatus | 'all')[] = [
  'all',
  'submitted',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
  'on_hold',
]
const statusOptions = computed<readonly UiSelectOption[]>(() =>
  dsrStatuses.map((status) => ({
    value: status,
    label: t(`observability.compliance.dsr.status.${status}`),
  })),
)

// --- DSR review/fulfill drawer ---
const selected = ref<DataSubjectRequest | null>(null)
function onDsrSelect(request: DataSubjectRequest): void {
  selected.value = request
}
async function onDsrDone(): Promise<void> {
  selected.value = null
  await dsr.refresh()
}

async function onRefresh(): Promise<void> {
  await Promise.all([retention.refresh(), dsr.refresh()])
}
function nextPage(): void {
  if (dsr.page.value < dsr.pageCount.value) dsr.page.value += 1
}
function previousPage(): void {
  if (dsr.page.value > 1) dsr.page.value -= 1
}
</script>

<template>
  <section class="compliance" data-page="compliance">
    <header class="compliance__hero">
      <span class="compliance__eyebrow">{{ t('observability.compliance.eyebrow') }}</span>
      <h1 class="compliance__title">{{ t('observability.compliance.title') }}</h1>
      <p class="compliance__summary">{{ t('observability.compliance.summary') }}</p>
      <p class="compliance__principal" data-principal-name>
        {{
          t('observability.compliance.signed_in_as', {
            name: store.principal?.display_name ?? '—',
          })
        }}
      </p>
    </header>

    <UiSkeleton
      v-if="pageState === 'loading'"
      :rows="6"
      :label="t('observability.compliance.loading')"
    />

    <UiStatusView
      v-else-if="pageState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('observability.compliance.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="pageState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="pageState === 'error'"
      tone="error"
      :eyebrow="t('observability.compliance.eyebrow')"
      :title="t('observability.compliance.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="pageRequestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else>
      <!-- Retention panel -->
      <section
        class="compliance__panel"
        data-panel="retention"
        aria-labelledby="compliance-retention-heading"
      >
        <header class="compliance__panel-head">
          <h2 id="compliance-retention-heading" class="compliance__panel-title">
            {{ t('observability.compliance.retention.title') }}
          </h2>
          <!-- Evidence folio: when the retention status was generated. Mirrors the
               cockpit's generated_at folio so the freshness of the masked snapshot
               is visible on the compliance page too. -->
          <dl class="compliance__evidence">
            <dt>{{ t('observability.compliance.retention.generated_at') }}</dt>
            <dd>
              <UiFolio :value="retention.retention.value?.generated_at" variant="timestamp" />
            </dd>
          </dl>
        </header>
        <div v-if="retention.isStale.value" class="compliance__banner" role="status">
          <AlertTriangle :size="16" aria-hidden="true" />
          <span>{{ t('observability.compliance.stale_banner') }}</span>
        </div>
        <UiEmptyState
          v-if="retention.viewState.value === 'empty'"
          :title="t('observability.compliance.retention.empty_title')"
          :description="t('observability.compliance.retention.empty_desc')"
        />
        <p
          v-else-if="retention.viewState.value === 'error'"
          class="compliance__section-error"
          role="status"
        >
          {{ t('common.error_loading_desc') }}
        </p>
        <UiDataList
          v-else
          :caption="t('observability.compliance.retention.title')"
          :columns="retentionColumns"
          :rows="retentionRows"
        />
      </section>

      <!-- Export + evidence pack -->
      <section
        class="compliance__panel"
        data-panel="export"
        aria-labelledby="compliance-export-heading"
      >
        <h2 id="compliance-export-heading" class="compliance__panel-title">
          {{ t('observability.compliance.export.title') }}
        </h2>
        <ComplianceExportPanel :can-export="canExport" />
      </section>

      <!-- DSR queue -->
      <section class="compliance__panel" data-panel="dsr" aria-labelledby="compliance-dsr-heading">
        <header class="compliance__panel-head">
          <h2 id="compliance-dsr-heading" class="compliance__panel-title">
            {{ t('observability.compliance.dsr.title') }}
          </h2>
          <dl class="compliance__evidence">
            <dt>{{ t('observability.compliance.dsr.shown') }}</dt>
            <dd><UiFolio :index="dsr.filteredTotal.value" :total="dsr.total.value" /></dd>
          </dl>
        </header>

        <div v-if="dsr.isStale.value" class="compliance__banner" role="status">
          <AlertTriangle :size="16" aria-hidden="true" />
          <span>{{ t('observability.compliance.stale_banner') }}</span>
        </div>

        <div class="compliance__controls">
          <UiInput
            v-model="dsr.query.value"
            :placeholder="t('observability.compliance.dsr.search_placeholder')"
            :aria-label="t('observability.compliance.dsr.search_placeholder')"
          />
          <UiSelect
            v-model="dsr.statusFilter.value"
            :options="statusOptions"
            :aria-label="t('observability.compliance.dsr.status_filter')"
          />
        </div>

        <UiEmptyState
          v-if="dsr.viewState.value === 'empty'"
          :title="t('observability.compliance.dsr.empty_title')"
          :description="t('observability.compliance.dsr.empty_desc')"
        />
        <p
          v-else-if="dsr.viewState.value === 'error'"
          class="compliance__section-error"
          role="status"
        >
          {{ t('common.error_loading_desc') }}
        </p>
        <template v-else>
          <DsrQueueTable
            :caption="t('observability.compliance.dsr.title')"
            :rows="dsr.paged.value"
            :can-review="canReview"
            @review="onDsrSelect"
            @fulfill="onDsrSelect"
          />
          <div class="compliance__pager">
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="dsr.page.value <= 1"
              @click="previousPage"
            >
              {{ t('observability.compliance.dsr.page_previous') }}
            </UiButton>
            <UiFolio :index="dsr.page.value" :total="dsr.pageCount.value" />
            <UiButton
              variant="secondary"
              size="sm"
              :disabled="dsr.page.value >= dsr.pageCount.value"
              @click="nextPage"
            >
              {{ t('observability.compliance.dsr.page_next') }}
            </UiButton>
          </div>
        </template>

        <UiDetailDrawer
          :open="selected !== null"
          title-id="compliance-dsr-drawer"
          :title="t('observability.compliance.dsr.review_title')"
          :description="t('observability.compliance.dsr.review_desc')"
          :close-label="t('common.btn_cancel')"
          @close="selected = null"
        >
          <DsrReviewActions v-if="selected" :request="selected" @done="onDsrDone" />
        </UiDetailDrawer>
      </section>
    </template>
  </section>
</template>

<style scoped>
.compliance {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.compliance__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.compliance__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.compliance__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.compliance__summary {
  margin: 0;
  max-width: 64ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.compliance__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.compliance__panel {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}
.compliance__panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.compliance__panel-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.compliance__evidence {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
}
.compliance__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.compliance__evidence dd {
  margin: 0;
}
.compliance__controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.compliance__pager {
  display: flex;
  align-items: center;
  gap: 12px;
}
.compliance__section-error {
  margin: 0;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--danger);
}
.compliance__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font: 500 0.8125rem/1.4 var(--font-sans);
  color: var(--warning-soft-fg);
  background: var(--warning-soft);
  border: 1px solid var(--warning-soft-border);
  border-radius: var(--r-md);
}
</style>
