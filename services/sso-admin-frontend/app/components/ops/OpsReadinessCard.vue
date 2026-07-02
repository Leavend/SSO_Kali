<!-- app/components/ops/OpsReadinessCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import {
  resolveReadinessTone,
  resolveCheckTone,
  resolveQueueTone,
} from '@/lib/ops/ops-view-state'
import type { OpsReadiness, OpsReadinessLabels } from '@/types/ops.types'

const props = defineProps<{
  readonly readiness: OpsReadiness
  readonly labels: OpsReadinessLabels
}>()

// Composed in the card from numeric values + unit labels (no i18n call here —
// the card is presentational; the page passes the unit labels in).
const queueSummary = computed<string>(() => {
  const queue = props.readiness.checks.queue
  if (!queue) return ''
  return `${queue.pending_jobs} ${props.labels.pending} · ${queue.failed_jobs} ${props.labels.failed}`
})
</script>

<template>
  <section class="ops-readiness" data-testid="ops-readiness" aria-label="readiness">
    <div class="ops-readiness__head">
      <strong class="ops-readiness__service">{{ readiness.service }}</strong>
      <UiStatusBadge
        data-testid="ops-readiness-status"
        :tone="resolveReadinessTone(readiness.ready)"
        :label="readiness.ready ? labels.ready : labels.degraded"
      />
    </div>

    <dl class="ops-readiness__grid">
      <div class="ops-readiness__row">
        <dt>{{ labels.database }}</dt>
        <dd>
          <UiStatusBadge
            data-testid="ops-check-database"
            :tone="resolveCheckTone(readiness.checks.database)"
            :label="readiness.checks.database ? labels.ok : labels.down"
          />
        </dd>
      </div>

      <div class="ops-readiness__row">
        <dt>{{ labels.redis }}</dt>
        <dd>
          <UiStatusBadge
            data-testid="ops-check-redis"
            :tone="resolveCheckTone(readiness.checks.redis)"
            :label="readiness.checks.redis ? labels.ok : labels.down"
          />
        </dd>
      </div>

      <div v-if="readiness.checks.queue" class="ops-readiness__row">
        <dt>{{ labels.queue }}</dt>
        <dd class="ops-readiness__queue">
          <UiStatusBadge
            data-testid="ops-check-queue"
            :tone="resolveQueueTone(readiness.checks.queue)"
            :label="queueSummary"
          />
          <span
            v-if="readiness.checks.queue.oldest_pending_age_seconds !== null"
            class="ops-readiness__oldest"
          >
            {{ labels.oldest }}:
            <UiFolio
              :value="String(readiness.checks.queue.oldest_pending_age_seconds)"
              variant="count"
            />
          </span>
        </dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.ops-readiness {
  display: grid;
  gap: 16px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-sm);
}
.ops-readiness__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.ops-readiness__service {
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ops-readiness__grid {
  margin: 0;
  display: grid;
  gap: 10px;
}
.ops-readiness__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ops-readiness__row dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ops-readiness__row dd {
  margin: 0;
}
.ops-readiness__queue {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ops-readiness__oldest {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
</style>
