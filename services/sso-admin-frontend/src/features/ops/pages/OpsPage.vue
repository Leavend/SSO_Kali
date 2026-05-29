<script setup lang="ts">
import { computed, onMounted } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useOpsStore } from '../stores/ops.store'

const store = useOpsStore()

const queueCheck = computed(() => store.readiness?.checks.queue ?? null)
const hasOpsEvidence = computed(() => store.readiness !== null)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="ops-page" aria-labelledby="ops-title">
    <div class="page-heading">
      <p class="eyebrow">Operations</p>
      <h1 id="ops-title">Ops Evidence</h1>
      <p class="page-summary">
        Readiness, operational drill evidence, dan compliance evidence references tanpa credential
        telemetry di browser.
      </p>
    </div>

    <div v-if="store.status === 'loading'" class="state-card" role="status">
      Memuat ops evidence...
    </div>

    <div
      v-else-if="store.status === 'forbidden'"
      class="state-card state-card--danger"
      role="alert"
    >
      <h2>Akses ops evidence ditolak</h2>
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
      <h2>Ops evidence belum bisa dimuat</h2>
      <p>{{ store.errorMessage }}</p>
    </div>

    <div v-else-if="!hasOpsEvidence" class="state-card" role="status">
      <h2>Evidence operasional belum tersedia</h2>
      <p>Belum ada evidence operasional untuk ditampilkan.</p>
    </div>

    <div v-else class="ops-layout">
      <section class="detail-section" aria-labelledby="readiness-title">
        <h2 id="readiness-title">Health & readiness</h2>
        <div v-if="store.readiness" class="state-card">
          <strong>{{ store.readiness.service }}</strong>
          <p>{{ store.readiness.ready ? 'ready' : 'degraded' }}</p>
          <p>database: {{ store.readiness.checks.database }}</p>
          <p>redis: {{ store.readiness.checks.redis }}</p>
          <p v-if="queueCheck">
            queue: {{ queueCheck.pending_jobs }} pending · {{ queueCheck.failed_jobs }} failed
          </p>
          <p v-if="store.readiness.timestamp">timestamp: {{ store.readiness.timestamp }}</p>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="drills-title">
        <h2 id="drills-title">Drill evidence</h2>
        <div class="state-card">
          <strong>JWKS rotation drill</strong>
          <p>
            Evidence source belum tersedia di backend admin contract; gunakan runbook ops sampai
            endpoint evidence tersedia.
          </p>
        </div>
        <div class="state-card">
          <strong>Discovery/JWKS availability drill timeline</strong>
          <p>
            SLI smoke history belum tersedia di backend admin contract; halaman ini tidak mengambil
            telemetry credential internal.
          </p>
        </div>
        <div class="state-card">
          <strong>Backup restore drill</strong>
          <p>Restore evidence pack belum tersedia di backend admin contract.</p>
        </div>
        <div class="state-card">
          <strong>DR failover drill</strong>
          <p>Failover signoff artifact belum tersedia di backend admin contract.</p>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="integrations-title">
        <h2 id="integrations-title">Incident & SIEM evidence</h2>
        <div class="state-card">
          <strong>Incident runbook evidence</strong>
          <p>
            Runbook refs ditampilkan sebagai evidence placeholder sampai backend mengirim artifact
            IDs.
          </p>
        </div>
        <div class="state-card">
          <strong>SIEM sink verification</strong>
          <p>
            Sink status/signoff belum tersedia di backend admin contract; tidak ada credential sink
            di browser.
          </p>
        </div>
      </section>
    </div>

    <EvidenceContextPanel title="Ops evidence" :request-id="store.requestId" />
  </section>
</template>
