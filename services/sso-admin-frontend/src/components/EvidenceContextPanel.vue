<script setup lang="ts">
import { computed } from 'vue'

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
</script>

<template>
  <section v-if="hasEvidence" class="detail-section" aria-label="Evidence context">
    <h3>{{ title ?? 'Evidence context' }}</h3>
    <dl class="inline-evidence">
      <div v-if="requestId">
        <dt>Request ID</dt>
        <dd class="break-anywhere">{{ requestId }}</dd>
      </div>
      <div v-if="correlationId">
        <dt>Correlation ID</dt>
        <dd class="break-anywhere">{{ correlationId }}</dd>
      </div>
      <div v-if="sessionId">
        <dt>SID</dt>
        <dd class="break-anywhere">{{ sessionId }}</dd>
      </div>
      <div v-if="clientId">
        <dt>Client ID</dt>
        <dd class="break-anywhere">{{ clientId }}</dd>
      </div>
      <div v-if="subjectId">
        <dt>Subject ID</dt>
        <dd class="break-anywhere">{{ subjectId }}</dd>
      </div>
      <div v-if="auditEventId">
        <dt>Audit event</dt>
        <dd class="break-anywhere">{{ auditEventId }}</dd>
      </div>
    </dl>
  </section>
</template>
