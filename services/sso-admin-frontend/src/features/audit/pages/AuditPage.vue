<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuditStore } from '../stores/audit.store'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '../types'

const store = useAuditStore()
const session = useSessionStore()
const canExportAudit = computed(() => session.hasPermission('admin.audit.export'))
const canGenerateEvidencePack = computed(() => session.hasPermission('admin.audit.export'))
const canReviewDsr = computed(() => session.hasPermission('admin.dsr.review'))
const reviewNotes = ref('Evidence verified')

const packFormat = ref<'zip' | 'json'>('zip')
const packFrom = ref('')
const packTo = ref('')
const packCorrelationId = ref('')

const canSubmitEvidencePack = computed(
  () => (packFrom.value !== '' && packTo.value !== '') || packCorrelationId.value.trim() !== '',
)

async function submitEvidencePack(): Promise<void> {
  if (!canSubmitEvidencePack.value) return
  const correlationId = packCorrelationId.value.trim()
  const filters: ComplianceEvidencePackFilters = {
    format: packFormat.value,
    ...(packFrom.value && { from: packFrom.value }),
    ...(packTo.value && { to: packTo.value }),
    ...(correlationId && { correlation_id: correlationId }),
  }
  await store.generateEvidencePack(filters)
}

const exportFormat = ref<'csv' | 'jsonl'>('csv')
const exportFrom = ref('')
const exportTo = ref('')
const exportAction = ref('')
const exportOutcome = ref('')
const searchRequestId = ref('')
const searchSessionId = ref('')
const searchAction = ref('')
const searchOutcome = ref('')
const searchTaxonomy = ref('')
const searchAdminSubjectId = ref('')
const searchSubjectId = ref('')
const searchFrom = ref('')
const searchTo = ref('')

function filled(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

async function submitSearch(): Promise<void> {
  await Promise.all([
    store.searchEvents({
      ...(filled(searchAction.value) && { action: filled(searchAction.value) }),
      ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
      ...(filled(searchTaxonomy.value) && { taxonomy: filled(searchTaxonomy.value) }),
      ...(filled(searchAdminSubjectId.value) && {
        admin_subject_id: filled(searchAdminSubjectId.value),
      }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
    store.searchAuthenticationEvents({
      ...(filled(searchRequestId.value) && { request_id: filled(searchRequestId.value) }),
      ...(filled(searchSessionId.value) && { session_id: filled(searchSessionId.value) }),
      ...(filled(searchSubjectId.value) && { subject_id: filled(searchSubjectId.value) }),
      ...(filled(searchOutcome.value) && { outcome: filled(searchOutcome.value) }),
      ...(searchFrom.value && { from: searchFrom.value }),
      ...(searchTo.value && { to: searchTo.value }),
    }),
  ])
}

async function resetSearch(): Promise<void> {
  searchRequestId.value = ''
  searchSessionId.value = ''
  searchAction.value = ''
  searchOutcome.value = ''
  searchTaxonomy.value = ''
  searchAdminSubjectId.value = ''
  searchSubjectId.value = ''
  searchFrom.value = ''
  searchTo.value = ''
  await Promise.all([store.searchEvents({}), store.searchAuthenticationEvents({})])
}

async function submitExport(): Promise<void> {
  const action = exportAction.value.trim()
  const outcome = exportOutcome.value.trim()
  const filters: AuditExportFilters = {
    format: exportFormat.value,
    ...(exportFrom.value && { from: exportFrom.value }),
    ...(exportTo.value && { to: exportTo.value }),
    ...(action && { action }),
    ...(outcome && { outcome }),
  }
  await store.exportEvents(filters)
}

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
    store.dataSubjectRequests.length > 0 ||
    store.integrity !== null,
)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="audit-page" aria-labelledby="audit-title">
    <div class="page-heading">
      <p class="eyebrow">Compliance Evidence</p>
      <h1 id="audit-title">Audit Compliance</h1>
      <p class="page-summary">Audit trail, integrity hash-chain, dan DSR evidence queue.</p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">Memuat audit...</div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses audit ditolak</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div
      v-else-if="store.status === 'unauthenticated'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Sesi admin berakhir</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="store.status === 'error'" class="state-card state-card--danger" role="alert">
      <h2>Audit compliance belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="!hasAuditEvidence" class="state-card" role="status">
      <h2>Evidence audit belum tersedia</h2>
      <p>Belum ada evidence audit untuk ditampilkan.</p>
    </div>

    <div v-else class="audit-layout">
      <section v-if="canExportAudit" class="detail-section" aria-labelledby="export-title">
        <h2 id="export-title">Export Audit Trail</h2>
        <p class="page-summary">
          Export audit events terfilter ke CSV atau JSONL. Aksi privileged: backend meminta
          re-autentikasi (step-up) dan permission AUDIT_EXPORT.
        </p>
        <fieldset class="export-format">
          <legend>Format</legend>
          <label class="checkbox-row">
            <input v-model="exportFormat" type="radio" name="export-format" value="csv" />
            CSV
          </label>
          <label class="checkbox-row">
            <input v-model="exportFormat" type="radio" name="export-format" value="jsonl" />
            JSONL
          </label>
        </fieldset>
        <div class="export-filters">
          <label class="reason-field">
            From
            <input v-model="exportFrom" name="export-from" type="date" />
          </label>
          <label class="reason-field">
            To
            <input v-model="exportTo" name="export-to" type="date" />
          </label>
          <label class="reason-field">
            Action
            <input v-model="exportAction" name="export-action" autocomplete="off" />
          </label>
          <label class="reason-field">
            Outcome
            <input v-model="exportOutcome" name="export-outcome" autocomplete="off" />
          </label>
        </div>
        <button
          class="primary-action audit-export-button"
          type="button"
          :disabled="store.actionStatus === 'loading'"
          @click="submitExport"
        >
          {{ store.actionStatus === 'loading' ? 'Exporting...' : 'Export' }}
        </button>
        <p v-if="store.actionStatus === 'step_up_required'" class="action-message" role="alert">
          {{ store.errorMessage }}
        </p>
      </section>

      <section
        v-if="canGenerateEvidencePack"
        class="detail-section"
        aria-labelledby="evidence-pack-title"
      >
        <h2 id="evidence-pack-title">Compliance Evidence Pack</h2>
        <p class="page-summary">
          Rakit paket bukti terkurasi (audit subset + integrity hash-chain + DSR terkait + retensi)
          untuk satu rentang tanggal atau satu correlation ID insiden. Aksi privileged: backend
          meminta re-autentikasi (step-up) dan permission AUDIT_EXPORT, lalu mencatat audit event
          <code>evidence_pack_generated</code>.
        </p>
        <fieldset class="export-format">
          <legend>Format paket</legend>
          <label class="checkbox-row">
            <input v-model="packFormat" type="radio" name="evidence-pack-format" value="zip" />
            ZIP
          </label>
          <label class="checkbox-row">
            <input v-model="packFormat" type="radio" name="evidence-pack-format" value="json" />
            JSON
          </label>
        </fieldset>
        <div class="export-filters">
          <label class="reason-field">
            From
            <input v-model="packFrom" name="evidence-pack-from" type="date" />
          </label>
          <label class="reason-field">
            To
            <input v-model="packTo" name="evidence-pack-to" type="date" />
          </label>
          <label class="reason-field">
            Correlation ID / insiden
            <input
              v-model="packCorrelationId"
              name="evidence-pack-correlation-id"
              autocomplete="off"
            />
          </label>
        </div>
        <p v-if="!canSubmitEvidencePack" class="muted">
          Isi rentang tanggal (From + To) atau correlation ID untuk mengaktifkan generate.
        </p>
        <button
          class="primary-action compliance-evidence-pack-button"
          type="button"
          :disabled="store.actionStatus === 'loading' || !canSubmitEvidencePack"
          @click="submitEvidencePack"
        >
          {{ store.actionStatus === 'loading' ? 'Generating...' : 'Generate evidence pack' }}
        </button>
        <p v-if="store.actionStatus === 'step_up_required'" class="action-message" role="alert">
          {{ store.errorMessage }}
        </p>
      </section>

      <section class="detail-section" aria-labelledby="integrity-title">
        <h2 id="integrity-title">Integrity evidence</h2>
        <p class="status-pill">
          {{ store.integrity?.verified ? 'Integrity verified' : 'Integrity needs review' }}
        </p>
        <dl class="inline-evidence">
          <div>
            <dt>Checked events</dt>
            <dd>{{ store.integrity?.checked_events ?? 'No evidence' }}</dd>
          </div>
          <div>
            <dt>Latest hash</dt>
            <dd>{{ store.integrity?.latest_event_hash ?? 'No evidence' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section" aria-labelledby="audit-search-title">
        <h2 id="audit-search-title">Cari audit event</h2>
        <p class="page-summary">
          Cari evidence berdasarkan correlation/request ID, SID, action, outcome, taxonomy, subject,
          atau rentang tanggal.
        </p>
        <div class="export-filters">
          <label class="reason-field">
            Correlation / request ID
            <input v-model="searchRequestId" name="audit-search-request-id" autocomplete="off" />
          </label>
          <label class="reason-field">
            SID
            <input v-model="searchSessionId" name="audit-search-session-id" autocomplete="off" />
          </label>
          <label class="reason-field">
            Action
            <input v-model="searchAction" name="audit-search-action" autocomplete="off" />
          </label>
          <label class="reason-field">
            Outcome
            <input v-model="searchOutcome" name="audit-search-outcome" autocomplete="off" />
          </label>
          <label class="reason-field">
            Taxonomy
            <input v-model="searchTaxonomy" name="audit-search-taxonomy" autocomplete="off" />
          </label>
          <label class="reason-field">
            Admin subject
            <input
              v-model="searchAdminSubjectId"
              name="audit-search-admin-subject-id"
              autocomplete="off"
            />
          </label>
          <label class="reason-field">
            Subject ID
            <input v-model="searchSubjectId" name="audit-search-subject-id" autocomplete="off" />
          </label>
          <label class="reason-field">
            From
            <input v-model="searchFrom" name="audit-search-from" type="date" />
          </label>
          <label class="reason-field">
            To
            <input v-model="searchTo" name="audit-search-to" type="date" />
          </label>
        </div>
        <div class="action-row compact-actions">
          <button class="primary-action audit-search-button" type="button" @click="submitSearch">
            Search
          </button>
          <button class="danger-action audit-reset-button" type="button" @click="resetSearch">
            Reset
          </button>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="events-title">
        <h2 id="events-title">Audit events</h2>
        <div class="audit-list">
          <button
            v-for="event in store.events"
            :key="event.event_id"
            class="user-list-item"
            :class="{ 'user-list-item--active': event.event_id === store.selectedEventId }"
            type="button"
            @click="store.selectEvent(event.event_id)"
          >
            <strong>{{ event.event_id }}</strong>
            <span>{{ event.action }}</span>
            <small>{{ event.outcome }} · {{ event.taxonomy ?? 'taxonomy unknown' }}</small>
          </button>
        </div>
        <p v-if="store.events.length === 0" class="muted">Belum ada audit event.</p>
        <button
          v-if="store.eventPagination?.has_more && store.eventPagination?.next_cursor"
          class="primary-action audit-load-more-button"
          type="button"
          @click="store.loadMoreEvents"
        >
          Muat lebih banyak audit event
        </button>
      </section>

      <article
        v-if="store.selectedEvent"
        class="detail-section"
        aria-labelledby="event-detail-title"
      >
        <h2 id="event-detail-title">Event detail</h2>
        <dl class="detail-grid">
          <div>
            <dt>Actor</dt>
            <dd>
              {{
                store.selectedEvent.actor?.email ??
                store.selectedEvent.actor?.subject_id ??
                'unknown'
              }}
            </dd>
          </div>
          <div>
            <dt>Request</dt>
            <dd>
              {{ store.selectedEvent.request?.method ?? 'GET' }}
              {{ store.selectedEvent.request?.path }}
            </dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{{ store.selectedEvent.reason ?? 'No reason evidence' }}</dd>
          </div>
          <div>
            <dt>Occurred at</dt>
            <dd>{{ store.selectedEvent.occurred_at ?? 'No timestamp' }}</dd>
          </div>
        </dl>
      </article>

      <section class="detail-section" aria-labelledby="security-evidence-title">
        <h2 id="security-evidence-title">Security notification evidence</h2>
        <div class="audit-list">
          <button
            v-for="event in store.authenticationEvents"
            :key="event.event_id"
            class="user-list-item"
            :class="{
              'user-list-item--active': event.event_id === store.selectedAuthenticationEventId,
            }"
            type="button"
            @click="store.selectAuthenticationEvent(event.event_id)"
          >
            <strong>{{ event.event_id }}</strong>
            <span>{{ event.event_type }}</span>
            <small
              >{{ event.outcome }} · {{ event.request?.request_id ?? 'no request evidence' }}</small
            >
          </button>
        </div>
        <p v-if="store.authenticationEvents.length === 0" class="muted">
          Belum ada security notification evidence.
        </p>
        <button
          v-if="
            store.authenticationEventPagination?.has_more &&
            store.authenticationEventPagination?.next_cursor
          "
          class="primary-action authentication-load-more-button"
          type="button"
          @click="store.loadMoreAuthenticationEvents"
        >
          Muat lebih banyak security notification evidence
        </button>
        <dl v-if="store.selectedAuthenticationEvent" class="detail-grid">
          <div>
            <dt>Subject</dt>
            <dd>
              {{
                store.selectedAuthenticationEvent.subject?.email ??
                store.selectedAuthenticationEvent.subject?.subject_id ??
                'unknown'
              }}
            </dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>{{ store.selectedAuthenticationEvent.client_id ?? 'No client evidence' }}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{{ store.selectedAuthenticationEvent.session_id ?? 'No SID evidence' }}</dd>
          </div>
          <div>
            <dt>Error code</dt>
            <dd>{{ store.selectedAuthenticationEvent.error_code ?? 'No error evidence' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section" aria-labelledby="challenge-title">
        <h2 id="challenge-title">Suspicious login challenge matrix</h2>
        <div class="state-card">
          <strong>Risk challenge evidence</strong>
          <p>
            Backend auth audit events show login challenge outcomes, MFA-required states, and
            notification dispatch evidence when recorded.
          </p>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="acr-title">
        <h2 id="acr-title">ACR permissive policy (NG-03)</h2>
        <div class="state-card">
          <strong>Accepted policy — permissive compat mode</strong>
          <p>
            Unknown ACR values are treated as no requirement (permissive) per accepted policy
            NG-03/FR-021. RPs requesting unrecognised assurance levels receive password-level flow
            rather than an error. Supported ACR values are advertised in
            <code>acr_values_supported</code> in the Discovery document.
          </p>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="portal-observable-title">
        <h2 id="portal-observable-title">Portal/backend observable evidence</h2>
        <div class="state-card">
          <strong>Consent revocation audit viewer</strong>
          <p>Consent allow, deny, and revoke events are reviewed through the audit event feed.</p>
        </div>
        <div class="state-card">
          <strong>Legacy portal session fallback sunset</strong>
          <p>
            Fallback usage stays an ops-tracked evidence item until backend emits a dedicated
            signal.
          </p>
        </div>
        <div class="state-card">
          <strong>Token lifetime production guard</strong>
          <p>
            Production token/session lifetime guard evidence remains backend-owned and deploy-gated.
          </p>
        </div>
        <div class="state-card">
          <strong>Session / logout evidence console</strong>
          <p>
            SID propagation, RP sessions, and front/back-channel logout outcomes use audit evidence.
          </p>
        </div>
        <div class="state-card">
          <strong>Safe error regression review</strong>
          <p>
            Admin evidence pages show request IDs and safe copy instead of raw backend/OIDC errors.
          </p>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="dsr-title">
        <h2 id="dsr-title">DSR queue</h2>
        <label v-if="canReviewDsr" class="reason-field">
          Review notes
          <input v-model="reviewNotes" autocomplete="off" />
        </label>
        <div
          v-for="request in store.dataSubjectRequests"
          :key="request.request_id"
          class="state-card"
        >
          <strong>{{ request.request_id }}</strong>
          <p>{{ request.type }} · {{ request.status }} · {{ request.subject_id }}</p>
          <p>SLA due: {{ request.sla_due_at ?? 'No SLA evidence' }}</p>
          <div v-if="canReviewDsr" class="action-row compact-actions">
            <button
              type="button"
              class="primary-action"
              @click="store.reviewRequest(request.request_id, 'approved', reviewNotes)"
            >
              Approve
            </button>
            <button
              type="button"
              class="danger-action"
              @click="store.reviewRequest(request.request_id, 'rejected', reviewNotes)"
            >
              Reject
            </button>
            <button
              type="button"
              class="primary-action"
              @click="store.fulfillRequest(request.request_id, true)"
            >
              Dry-run fulfill
            </button>
          </div>
        </div>
        <p v-if="store.dataSubjectRequests.length === 0" class="muted">Tidak ada DSR submitted.</p>
      </section>

      <p v-if="store.errorMessage" class="action-message">{{ store.errorMessage }}</p>
    </div>

    <EvidenceContextPanel
      title="Audit evidence context"
      :request-id="store.requestId"
      :correlation-id="selectedCorrelationId"
      :session-id="selectedSessionId"
      :client-id="selectedClientId"
      :subject-id="selectedSubjectId"
    />
  </section>
</template>
