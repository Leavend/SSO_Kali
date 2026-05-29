<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useAuditStore } from '../stores/audit.store'

const store = useAuditStore()
const reviewNotes = ref('Evidence verified')

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
        <h2 id="acr-title">Unknown ACR policy</h2>
        <div class="state-card">
          <strong>Compatibility mode</strong>
          <p>
            Unknown ACR decisions remain backend-owned; this UI exposes safe audit evidence without
            rendering raw provider errors.
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
        <label class="reason-field">
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
          <div class="action-row compact-actions">
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
