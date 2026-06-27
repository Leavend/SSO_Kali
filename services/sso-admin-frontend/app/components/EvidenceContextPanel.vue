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

const hasEvidence = computed<boolean>(
  () =>
    !!props.requestId ||
    !!props.correlationId ||
    !!props.sessionId ||
    !!props.clientId ||
    !!props.subjectId ||
    !!props.auditEventId,
)

const supportReference = computed<string | null>(() =>
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
  <section v-if="hasEvidence" class="evidence" aria-label="Evidence context">
    <h3 class="evidence__title">{{ title ?? 'Evidence context' }}</h3>
    <dl v-if="supportReference" class="evidence__list">
      <div>
        <dt>{{ t('common.evidence.ref_code') }}</dt>
        <dd class="evidence__ref">{{ supportReference }}</dd>
      </div>
    </dl>
    <details v-if="technicalRows.length" class="evidence__details">
      <summary>{{ t('common.evidence.tech_details') }}</summary>
      <dl class="evidence__list">
        <div v-for="row in technicalRows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd class="evidence__ref">{{ row.value }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.evidence {
  padding: 16px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.evidence__title {
  margin: 0 0 10px;
  font: 600 0.8125rem/1 var(--font-sans);
  color: var(--fg);
}
.evidence__list {
  display: grid;
  gap: 8px;
  margin: 0;
}
.evidence__list > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.evidence__list dt {
  font: 500 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.evidence__ref {
  margin: 0;
  font: 400 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
  overflow-wrap: anywhere;
  word-break: break-word;
  text-align: right;
}
.evidence__details {
  margin-top: 12px;
}
.evidence__details > summary {
  cursor: pointer;
  font: 600 0.75rem/1 var(--font-sans);
  color: var(--fg-2);
}
.evidence__details[open] > summary {
  margin-bottom: 10px;
}
</style>
