<script setup lang="ts">
import { computed, onMounted } from 'vue'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import { useOpsStore } from '../stores/ops.store'
import { OPS_DRILLS, runbookHref } from '../drills'

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
        <p class="page-summary">
          Drill operasional dieksekusi lewat CI workflow dan runbook (bukan backend admin API). Tiap
          kartu menautkan system-of-record dan runbook resmi untuk menjalankan dan mengumpulkan
          evidence.
        </p>
        <div v-for="drill in OPS_DRILLS" :key="drill.key" class="state-card">
          <strong>{{ drill.title }}</strong>
          <p>{{ drill.summary }}</p>
          <p class="muted">System of record: {{ drill.systemOfRecord }}</p>
          <p>
            <a
              class="runbook-link"
              :href="runbookHref(drill.runbookPath)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka runbook: {{ drill.runbookPath }}
            </a>
          </p>
          <p v-if="drill.evidenceRef">
            <a
              class="evidence-link"
              :href="runbookHref(drill.evidenceRef)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Lihat evidence: {{ drill.evidenceRef }}
            </a>
          </p>
        </div>
      </section>
    </div>

    <EvidenceContextPanel title="Ops evidence" :request-id="store.requestId" />
  </section>
</template>
