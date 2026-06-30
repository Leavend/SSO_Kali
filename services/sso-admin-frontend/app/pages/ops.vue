<!-- app/pages/ops.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '@/stores/session.store'
import { useI18n } from '@/composables/useI18n'
import { useOpsReadiness } from '@/composables/useOpsReadiness'
import { OPS_DRILLS } from '@/lib/ops/ops-drills'
import type { OpsReadinessLabels } from '@/types/ops.types'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStatusView from '@/components/ui/UiStatusView.vue'
import UiButton from '@/components/ui/UiButton.vue'
import OpsReadinessCard from '@/components/ops/OpsReadinessCard.vue'
import OpsDrillsList from '@/components/ops/OpsDrillsList.vue'

definePageMeta({
  name: 'admin.ops',
  layout: 'admin',
  requiresAdmin: true,
  permissions: ['admin.dashboard.view'],
})

const { t } = useI18n()
const store = useSessionStore()

await useAsyncData('admin-ops-principal', () => store.ensureSession())

const { readiness, viewState, requestId, refresh } = useOpsReadiness()

const readinessLabels = computed<OpsReadinessLabels>(() => ({
  ready: t('ops.status_ready'),
  degraded: t('ops.status_degraded'),
  database: t('ops.check_database'),
  redis: t('ops.check_redis'),
  queue: t('ops.check_queue'),
  ok: t('ops.check_ok'),
  down: t('ops.check_down'),
  pending: t('ops.queue_pending'),
  failed: t('ops.queue_failed'),
  oldest: t('ops.queue_oldest'),
}))

async function onRefresh(): Promise<void> {
  await refresh()
}
</script>

<template>
  <section class="ops" data-page="ops" data-admin-shell>
    <header class="ops__hero">
      <span class="ops__eyebrow">{{ t('ops.eyebrow') }}</span>
      <h1 class="ops__title">{{ t('ops.title') }}</h1>
      <p class="ops__summary">{{ t('ops.summary') }}</p>
      <p class="ops__principal" data-principal-name>
        {{ t('ops.signed_in_as', { name: store.principal?.display_name ?? '—' }) }}
      </p>
    </header>

    <UiSkeleton v-if="viewState === 'loading'" :rows="5" :label="t('ops.loading')" />

    <UiStatusView
      v-else-if="viewState === 'forbidden'"
      tone="forbidden"
      :eyebrow="t('ops.eyebrow')"
      :title="t('ops.forbidden_title')"
      :description="t('common.forbidden_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'unauthenticated'"
      tone="step_up"
      :eyebrow="t('ops.eyebrow')"
      :title="t('common.session_expired_title')"
      :description="t('common.session_expired_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    />

    <UiStatusView
      v-else-if="viewState === 'error'"
      tone="error"
      :eyebrow="t('ops.eyebrow')"
      :title="t('ops.error_title')"
      :description="t('common.error_loading_desc')"
      :request-id="requestId ?? undefined"
      :standalone="false"
    >
      <template #actions>
        <UiButton variant="secondary" size="sm" data-testid="ops-refresh" @click="onRefresh">
          {{ t('common.btn_refresh') }}
        </UiButton>
      </template>
    </UiStatusView>

    <template v-else-if="readiness">
      <section class="ops__section" aria-labelledby="ops-readiness-title">
        <h2 id="ops-readiness-title" class="ops__section-title">{{ t('ops.readiness_title') }}</h2>
        <OpsReadinessCard :readiness="readiness" :labels="readinessLabels" />
      </section>

      <section class="ops__section" aria-labelledby="ops-drills-title">
        <h2 id="ops-drills-title" class="ops__section-title">{{ t('ops.drills_title') }}</h2>
        <p class="ops__section-summary">{{ t('ops.drills_summary') }}</p>
        <OpsDrillsList
          :drills="OPS_DRILLS"
          :runbook-cta-label="t('ops.drill_runbook_cta')"
          :evidence-cta-label="t('ops.drill_evidence_cta')"
          :system-of-record-label="t('ops.drill_system_of_record')"
        />
      </section>
    </template>
  </section>
</template>

<style scoped>
.ops {
  display: grid;
  gap: 24px;
  padding: 24px;
}
.ops__hero {
  display: grid;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.ops__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ops__title {
  margin: 0;
  font: 600 1.5rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ops__summary,
.ops__principal {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ops__section {
  display: grid;
  gap: 12px;
}
.ops__section-title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.ops__section-summary {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
