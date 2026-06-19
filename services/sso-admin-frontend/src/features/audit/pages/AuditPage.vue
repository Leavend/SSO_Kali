<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch, nextTick } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useDateFormat } from '@/composables/useDateFormat'
import { useTabPill } from '@/composables/useTabPill'
import { useRoute } from 'vue-router'
import {
  ClipboardList,
  ShieldCheck,
  Download,
  History,
  UserX,
  AlertTriangle,
  RefreshCw,
} from 'lucide-vue-next'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import type { SectionKey } from '@/features/audit/stores/audit.store'
import {
  formatFriendlyClientName,
  formatTechnicalPreview,
  formatSupportReference,
} from '@/lib/display-identifiers'

// Async Components (ISS-LCP2)
const EvidenceContextPanel = defineAsyncComponent(
  () => import('@/components/EvidenceContextPanel.vue'),
)
const UiDialog = defineAsyncComponent(() => import('@/components/ui/UiDialog.vue'))

import AuditLogsTab from '../components/AuditLogsTab.vue'
const SecurityNotificationTab = defineAsyncComponent(
  () => import('../components/SecurityNotificationTab.vue'),
)
const ExportEvidenceTab = defineAsyncComponent(() => import('../components/ExportEvidenceTab.vue'))
const RetentionIntegrityTab = defineAsyncComponent(
  () => import('../components/RetentionIntegrityTab.vue'),
)
const DsrQueueTab = defineAsyncComponent(() => import('../components/DsrQueueTab.vue'))

const store = useAuditStore()
const session = useSessionStore()
const route = useRoute()
const { t } = useI18n()
const dateFormat = useDateFormat()

const activeTab = ref<'logs' | 'security' | 'reports' | 'retention' | 'dsr'>('logs')

const tabComponents = {
  logs: AuditLogsTab,
  security: SecurityNotificationTab,
  reports: ExportEvidenceTab,
  retention: RetentionIntegrityTab,
  dsr: DsrQueueTab,
}

const currentTabComponent = computed(() => tabComponents[activeTab.value])

const canExportAudit = computed(() => session.hasPermission('admin.audit.export'))
const canGenerateEvidencePack = computed(() => session.hasPermission('admin.audit.export'))
const canReviewDsr = computed(() => session.hasPermission('admin.dsr.review'))

const activeDetailDialog = ref<'audit' | 'authentication' | null>(null)

const selectedCorrelationId = computed(
  () => store.selectedAuthenticationEvent?.request?.request_id ?? null,
)
const selectedSessionId = computed(() => store.selectedAuthenticationEvent?.session_id ?? null)
const selectedClientId = computed(() => store.selectedAuthenticationEvent?.client_id ?? null)
const selectedSubjectId = computed(
  () =>
    store.selectedAuthenticationEvent?.subject?.subject_id ??
    store.selectedEvent?.actor?.subject_id ??
    null,
)
const hasAuditEvidence = computed(
  () =>
    store.events.length > 0 ||
    store.authenticationEvents.length > 0 ||
    store.consentEvents.length > 0 ||
    store.dataSubjectRequests.length > 0 ||
    store.integrity !== null ||
    store.retentionStatus !== null,
)

// ISS-C3: per-section error + retry
const sectionLabels: Record<SectionKey, string> = {
  events: 'Admin audit events',
  authEvents: 'Authentication events',
  integrity: 'Integrity hash-chain',
  retention: 'Retention status',
  dsr: 'DSR queue',
}

function sectionLabel(key: SectionKey): string {
  return sectionLabels[key] ?? key
}

async function retrySection(key: SectionKey): Promise<void> {
  await store.retrySection(key)
}

function isSectionErrored(key: SectionKey): boolean {
  const s = store.sections[key]
  return s.status === 'error' || s.status === 'forbidden' || s.status === 'unauthenticated'
}

const hasAnySectionErrored = computed(() =>
  (Object.keys(store.sections) as SectionKey[]).some((k) => isSectionErrored(k)),
)

const erroredSectionKeys = computed(() =>
  (Object.keys(store.sections) as SectionKey[]).filter((k) => isSectionErrored(k)),
)

function openAuditEventDetail(eventId: string): void {
  store.selectEvent(eventId)
  activeDetailDialog.value = 'audit'
}

function openAuthenticationEventDetail(eventId: string): void {
  store.selectAuthenticationEvent(eventId)
  activeDetailDialog.value = 'authentication'
}

function closeDetailDialog(): void {
  activeDetailDialog.value = null
}

const visibleTabs = computed(() => {
  const tabs: Array<'logs' | 'security' | 'reports' | 'retention' | 'dsr'> = ['logs', 'security']
  if (canExportAudit.value || canGenerateEvidencePack.value) {
    tabs.push('reports')
  }
  tabs.push('retention')
  if (canReviewDsr.value) {
    tabs.push('dsr')
  }
  return tabs
})

const tabsContainerRef = ref<HTMLElement | null>(null)
const { pillStyle, updatePillPosition } = useTabPill({
  containerRef: tabsContainerRef,
  activeSelector: '.audit-tab-btn--active',
  scrollActiveIntoView: true,
})

watch(activeTab, () => {
  nextTick(() => {
    updatePillPosition()
  })
})

function selectTab(tab: 'logs' | 'security' | 'reports' | 'retention' | 'dsr'): void {
  activeTab.value = tab
}
</script>

<template>
  <section class="audit-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="audit-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('audit.eyebrow') }}</p>
      <h1 id="audit-title">{{ t('audit.title') }}</h1>
      <p class="page-summary">{{ t('audit.summary') }}</p>
    </div>

    <UiStatusView
      v-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Compliance Evidence"
      :title="t('audit.forbidden_title')"
      :description="store.errorMessage ?? t('common.forbidden_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'unauthenticated'"
      tone="error"
      eyebrow="Session"
      :title="t('common.session_expired_title')"
      :description="store.errorMessage ?? t('common.session_expired_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="store.status === 'error' && !hasAuditEvidence"
      tone="api"
      eyebrow="Admin API"
      :title="t('audit.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <div v-else class="audit-workspace space-y-6" :aria-busy="store.status === 'loading'">
      <!-- ISS-C3: per-section error cards -->
      <section v-if="hasAnySectionErrored" class="space-y-3" aria-label="Section errors">
        <div
          v-for="key in erroredSectionKeys"
          :key="key"
          class="ui-card border-destructive/40 bg-destructive/5 p-4 space-y-2"
          role="alert"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <AlertTriangle class="size-5 mt-0.5 text-destructive shrink-0" />
              <div class="min-w-0">
                <h3 class="text-sm font-bold text-destructive">{{ sectionLabel(key) }}</h3>
                <p class="text-xs text-muted-foreground leading-relaxed mt-1 break-words">
                  {{ store.sections[key]?.error ?? 'Failed to load.' }}
                </p>
              </div>
            </div>
            <UiButton
              variant="secondary"
              size="sm"
              class="shrink-0"
              :disabled="store.sections[key]?.status === 'loading'"
              @click="retrySection(key)"
            >
              <RefreshCw
                class="size-4 mr-1"
                :class="{ 'animate-spin': store.sections[key]?.status === 'loading' }"
              />
              Retry
            </UiButton>
          </div>
        </div>
      </section>

      <!-- Horizontal Tab System -->
      <div class="audit-tabs-container scroll-edge-indicator">
        <nav ref="tabsContainerRef" class="audit-tabs" aria-label="Audit navigation tabs">
          <div class="audit-tabs__pill" :style="pillStyle"></div>
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'logs' }"
            type="button"
            @click="selectTab('logs')"
          >
            <ClipboardList class="size-4" />
            <span>{{ t('audit.tab_logs') }}</span>
          </button>
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'security' }"
            type="button"
            @click="selectTab('security')"
          >
            <ShieldCheck class="size-4" />
            <span>{{ t('audit.tab_security') }}</span>
          </button>
          <button
            v-if="canExportAudit || canGenerateEvidencePack"
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'reports' }"
            type="button"
            @click="selectTab('reports')"
          >
            <Download class="size-4" />
            <span>{{ t('audit.tab_reports') }}</span>
          </button>
          <button
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'retention' }"
            type="button"
            @click="selectTab('retention')"
          >
            <History class="size-4" />
            <span>{{ t('audit.tab_retention') }}</span>
          </button>
          <button
            v-if="canReviewDsr"
            class="audit-tab-btn"
            :class="{ 'audit-tab-btn--active': activeTab === 'dsr' }"
            type="button"
            @click="selectTab('dsr')"
          >
            <UserX class="size-4" />
            <span>{{ t('audit.tab_dsr') }}</span>
          </button>
        </nav>
      </div>

      <!-- Tab Content Area using KeepAlive & Dynamic Async Components (ISS-LCP1 & ISS-LCP2) -->
      <div class="space-y-6">
        <KeepAlive>
          <Suspense :key="activeTab">
            <template #default>
              <component
                :is="currentTabComponent"
                @open-audit-detail="openAuditEventDetail"
                @open-auth-detail="openAuthenticationEventDetail"
              />
            </template>
            <template #fallback>
              <div class="audit-tab-loading-fallback" />
            </template>
          </Suspense>
        </KeepAlive>
      </div>

      <p
        v-if="store.errorMessage"
        class="text-sm font-bold text-destructive bg-destructive/10 p-3 rounded-lg mt-6"
        role="alert"
      >
        {{ store.errorMessage }}
      </p>
    </div>

    <!-- Evidence contextual panel -->
    <EvidenceContextPanel
      title="Audit evidence context"
      :request-id="store.requestId"
      :correlation-id="selectedCorrelationId"
      :session-id="selectedSessionId"
      :client-id="selectedClientId"
      :subject-id="selectedSubjectId"
    />

    <UiDialog
      :open="activeDetailDialog === 'audit' && !!store.selectedEvent"
      title-id="audit-event-detail-dialog"
      :title="t('audit.event_detail_title')"
      :description="t('audit.event_detail_desc')"
      :close-label="t('common.close')"
      overlay-class="audit-detail-overlay"
      wide
      @close="closeDetailDialog"
    >
      <article v-if="store.selectedEvent" class="audit-detail-dialog space-y-4">
        <div class="border-b border-border pb-2">
          <span
            class="audit-badge"
            :class="
              store.selectedEvent.outcome === 'succeeded'
                ? 'audit-badge--success'
                : 'audit-badge--danger'
            "
          >
            {{ store.selectedEvent.outcome }}
          </span>
        </div>
        <dl class="space-y-3">
          <div class="flex flex-col gap-1">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">Actor</dt>
            <dd class="text-sm font-semibold break-anywhere">
              {{
                store.selectedEvent.actor?.email ??
                formatTechnicalPreview(store.selectedEvent.actor?.subject_id)
              }}
            </dd>
          </div>
          <div class="flex flex-col gap-1 border-t border-border pt-2">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">Request</dt>
            <dd class="text-sm break-anywhere bg-muted p-2 rounded-lg font-mono">
              <span class="font-bold text-primary mr-1">{{
                store.selectedEvent.request?.method ?? 'GET'
              }}</span>
              {{ store.selectedEvent.request?.path }}
            </dd>
          </div>
          <div class="flex flex-col gap-1 border-t border-border pt-2">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">Reason</dt>
            <dd class="text-sm break-anywhere">
              {{ store.selectedEvent.reason ?? 'No reason evidence' }}
            </dd>
          </div>
          <div class="flex flex-col gap-1 border-t border-border pt-2">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Occurred at
            </dt>
            <dd class="text-sm font-mono">
              {{ dateFormat.smart(store.selectedEvent.occurred_at) }}
            </dd>
          </div>
          <div
            v-if="
              store.selectedEvent.context?.request_id ||
              store.selectedEvent.context?.support_reference
            "
            class="flex flex-col gap-1 border-t border-border pt-2"
          >
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {{ t('audit.correlation_ids') }}
            </dt>
            <dd class="text-sm font-mono break-anywhere space-y-1">
              <div v-if="store.selectedEvent.context?.request_id">
                <span class="font-bold">{{ t('audit.request_id') }}:</span>
                {{ store.selectedEvent.context.request_id }}
              </div>
              <div v-if="store.selectedEvent.context?.support_reference">
                <span class="font-bold">{{ t('audit.support_ref') }}:</span>
                {{ store.selectedEvent.context.support_reference }}
              </div>
            </dd>
          </div>
        </dl>
      </article>
    </UiDialog>

    <UiDialog
      :open="activeDetailDialog === 'authentication' && !!store.selectedAuthenticationEvent"
      title-id="authentication-event-detail-dialog"
      :title="t('audit.security_event_detail_title')"
      :description="t('audit.security_event_detail_desc')"
      :close-label="t('common.close')"
      overlay-class="audit-detail-overlay"
      wide
      @close="closeDetailDialog"
    >
      <article v-if="store.selectedAuthenticationEvent" class="audit-detail-dialog space-y-4">
        <div class="border-b border-border pb-2">
          <span
            class="audit-badge"
            :class="
              store.selectedAuthenticationEvent.outcome === 'succeeded'
                ? 'audit-badge--success'
                : 'audit-badge--danger'
            "
          >
            {{ store.selectedAuthenticationEvent.outcome }}
          </span>
        </div>
        <dl class="space-y-3">
          <div class="flex flex-col gap-1">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">Subject</dt>
            <dd class="text-sm font-semibold break-anywhere">
              {{
                store.selectedAuthenticationEvent.subject?.email ??
                formatTechnicalPreview(store.selectedAuthenticationEvent.subject?.subject_id)
              }}
            </dd>
          </div>
          <div class="flex flex-col gap-1 border-t border-border pt-2">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">Client</dt>
            <dd class="text-sm break-anywhere font-semibold">
              {{ formatFriendlyClientName(store.selectedAuthenticationEvent.client_id) }}
            </dd>
          </div>
          <div class="flex flex-col gap-1 border-t border-border pt-2">
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Kode sesi
            </dt>
            <dd class="text-sm font-mono break-anywhere">
              {{ formatTechnicalPreview(store.selectedAuthenticationEvent.session_id) }}
            </dd>
          </div>
          <div
            v-if="store.selectedAuthenticationEvent.error_code"
            class="flex flex-col gap-1 border-t border-border pt-2"
          >
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Error code
            </dt>
            <dd class="text-sm text-destructive font-semibold">
              {{ store.selectedAuthenticationEvent.error_code }}
            </dd>
          </div>
          <div
            v-if="store.selectedAuthenticationEvent.request?.request_id"
            class="flex flex-col gap-1 border-t border-border pt-2"
          >
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {{ t('audit.request_id') }}
            </dt>
            <dd class="text-sm font-mono break-anywhere">
              {{ store.selectedAuthenticationEvent.request.request_id }}
            </dd>
          </div>
          <div
            v-if="store.selectedAuthenticationEvent.request?.request_id"
            class="flex flex-col gap-1 border-t border-border pt-2"
          >
            <dt class="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {{ t('audit.support_ref') }}
            </dt>
            <dd class="text-sm font-mono break-anywhere">
              {{ formatSupportReference(store.selectedAuthenticationEvent.request.request_id) }}
            </dd>
          </div>
        </dl>
      </article>
    </UiDialog>
  </section>
</template>
