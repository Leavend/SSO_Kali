<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import {
  formatFriendlyClientName,
  formatSupportReference,
  formatTechnicalPreview,
} from '@/lib/display-identifiers'

const { t } = useI18n()

const props = defineProps<{
  readonly title?: string
  readonly requestId?: string | null
  readonly correlationId?: string | null
  readonly sessionId?: string | null
  readonly clientId?: string | null
  readonly subjectId?: string | null
  readonly auditEventId?: string | null
}>()

const hasEvidence = computed(
  () =>
    !!props.requestId ||
    !!props.correlationId ||
    !!props.sessionId ||
    !!props.clientId ||
    !!props.subjectId ||
    !!props.auditEventId,
)

const supportReference = computed(() =>
  formatSupportReference(
    props.requestId ??
      props.correlationId ??
      props.auditEventId ??
      props.sessionId ??
      props.subjectId ??
      props.clientId,
  ),
)

const technicalRows = computed(() =>
  [
    { label: 'Request', value: props.requestId },
    { label: 'Correlation', value: props.correlationId },
    { label: 'Session', value: props.sessionId },
    { label: t('common.evidence.client'), value: props.clientId, client: true },
    { label: t('common.evidence.subject'), value: props.subjectId },
    { label: 'Audit event', value: props.auditEventId },
  ]
    .filter((row) => !!row.value)
    .map((row) => ({
      label: row.label,
      value: row.client ? formatFriendlyClientName(row.value) : formatTechnicalPreview(row.value),
    })),
)
</script>

<template>
  <section v-if="hasEvidence" class="detail-section" aria-label="Evidence context">
    <h3>{{ title ?? 'Evidence context' }}</h3>
    <dl class="inline-evidence">
      <div v-if="supportReference">
        <dt>{{ t('common.evidence.ref_code') }}</dt>
        <dd class="break-anywhere">{{ supportReference }}</dd>
      </div>
    </dl>
    <details v-if="technicalRows.length" class="technical-evidence">
      <summary>{{ t('common.evidence.tech_details') }}</summary>
      <dl class="inline-evidence">
        <div v-for="row in technicalRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd class="break-anywhere">{{ row.value }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.technical-evidence {
  margin-top: 0.75rem;
}

.technical-evidence > summary {
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  color: hsl(var(--muted-foreground));
}

.technical-evidence[open] > summary {
  margin-bottom: 0.65rem;
}
</style>
