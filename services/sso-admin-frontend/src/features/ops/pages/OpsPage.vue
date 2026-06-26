<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import EvidenceContextPanel from '@/components/EvidenceContextPanel.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import { useOpsStore } from '../stores/ops.store'
import { OPS_DRILLS, runbookHref } from '../drills'

const store = useOpsStore()
const { t } = useI18n()

const queueCheck = computed(() => store.readiness?.checks.queue ?? null)
const hasOpsEvidence = computed(() => store.readiness !== null)

onMounted(() => {
  if (store.status === 'idle') void store.load()
})
</script>

<template>
  <section class="ops-page max-w-page mx-auto px-4 md:px-6 py-8" aria-labelledby="ops-title">
    <div class="page-heading">
      <p class="eyebrow">{{ t('ops.eyebrow') }}</p>
      <h1 id="ops-title">{{ t('ops.title') }}</h1>
      <p class="page-summary">{{ t('ops.summary') }}</p>
    </div>

    <UiSkeleton v-if="store.status === 'loading'" :label="t('ops.loading')" />

    <UiStatusView
      v-else-if="store.status === 'forbidden'"
      tone="forbidden"
      eyebrow="Operations"
      :title="t('ops.forbidden_title')"
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
      v-else-if="store.status === 'error'"
      tone="api"
      eyebrow="Admin API"
      :title="t('ops.error_title')"
      :description="store.errorMessage ?? t('common.error_loading_desc')"
      :request-id="store.requestId ?? undefined"
      :standalone="false"
    />

    <UiEmptyState
      v-else-if="!hasOpsEvidence"
      :title="t('ops.empty_title')"
      :description="t('ops.empty_desc')"
    />

    <div v-else class="ops-layout">
      <section class="detail-section" aria-labelledby="readiness-title">
        <h2 id="readiness-title">{{ t('ops.readiness_title') }}</h2>
        <div v-if="store.readiness" class="ui-card ops-readiness">
          <div class="ops-readiness__head">
            <strong>{{ store.readiness.service }}</strong>
            <UiStatusBadge
              :tone="store.readiness.ready ? 'success' : 'danger'"
              :label="store.readiness.ready ? 'ready' : 'degraded'"
            />
          </div>
          <dl class="ops-checks">
            <div class="ops-checks__row">
              <dt>database</dt>
              <dd>
                <UiStatusBadge
                  :tone="store.readiness.checks.database ? 'success' : 'danger'"
                  :label="store.readiness.checks.database ? 'ok' : 'down'"
                />
              </dd>
            </div>
            <div class="ops-checks__row">
              <dt>redis</dt>
              <dd>
                <UiStatusBadge
                  :tone="store.readiness.checks.redis ? 'success' : 'danger'"
                  :label="store.readiness.checks.redis ? 'ok' : 'down'"
                />
              </dd>
            </div>
            <div v-if="queueCheck" class="ops-checks__row">
              <dt>queue</dt>
              <dd>
                <UiStatusBadge
                  :tone="
                    queueCheck.failed_jobs > 0
                      ? 'danger'
                      : queueCheck.pending_jobs > 0
                        ? 'warning'
                        : 'success'
                  "
                  :label="`${queueCheck.pending_jobs} pending · ${queueCheck.failed_jobs} failed`"
                />
              </dd>
            </div>
            <div v-if="store.readiness.timestamp" class="ops-checks__row">
              <dt>timestamp</dt>
              <dd>{{ store.readiness.timestamp }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="detail-section" aria-labelledby="drills-title">
        <h2 id="drills-title">{{ t('ops.drills_title') }}</h2>
        <p class="page-summary">
          Drill operasional dieksekusi lewat CI workflow dan runbook (bukan backend admin API). Tiap
          kartu menautkan system-of-record dan runbook resmi untuk menjalankan dan mengumpulkan
          evidence.
        </p>
        <div v-for="drill in OPS_DRILLS" :key="drill.key" class="ui-card">
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

<style scoped>
.ops-readiness {
  display: grid;
  gap: 14px;
}

.ops-readiness__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.ops-checks {
  margin: 0;
  display: grid;
  gap: 8px;
}

.ops-checks__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ops-checks__row dt {
  font-size: 0.8125rem;
  color: var(--fg-2);
}

.ops-checks__row dd {
  margin: 0;
}
</style>
