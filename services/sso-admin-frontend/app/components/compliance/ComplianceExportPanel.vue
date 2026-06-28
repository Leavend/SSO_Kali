<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  AuditExportFilters,
  AuditExportFormat,
  ComplianceEvidencePackFilters,
  EvidencePackFormat,
} from '@/types/compliance.types'
import type { BlobResponse } from '@/lib/api/api-client'
import { usePrivilegedAction } from '@/composables/usePrivilegedAction'
import PrivilegedActionDialog from '@/components/users/PrivilegedActionDialog.vue'
import { observabilityApi } from '@/services/observability.api'
import { triggerBlobDownload } from '@/lib/api/download-blob'
import {
  auditExportFallbackName,
  canSubmitEvidencePack,
  evidencePackFallbackName,
} from '@/lib/compliance/audit-export'
import { useI18n } from '@/composables/useI18n'
import UiButton from '@/components/ui/UiButton.vue'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'

defineProps<{ canExport: boolean }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

// Each export is its own privileged action (exports never share a runner — a
// failed export must not poison the evidence-pack dialog state, and vice versa).
// BOTH surface the full failure matrix incl. 428 step-up.
const exportAction = usePrivilegedAction<BlobResponse>()
const evidenceAction = usePrivilegedAction<BlobResponse>()

type Flow = 'export' | 'evidence'
const activeFlow = ref<Flow | null>(null)

type OutcomeFilter = '' | 'succeeded' | 'denied' | 'failed'

// Audit export form state.
const exportFormat = ref<AuditExportFormat>('csv')
const exportFrom = ref('')
const exportTo = ref('')
const exportActionFilter = ref('')
const exportOutcome = ref<OutcomeFilter>('')

// Evidence-pack form state.
const packFormat = ref<EvidencePackFormat>('zip')
const packFrom = ref('')
const packTo = ref('')
const packCorrelationId = ref('')

// UiSelect speaks `string`; the underlying refs carry the narrowed literal union
// the filter/fallback helpers require. These writable proxies keep the v-model
// binding type-checking while the options only ever emit a valid member (the
// established clients/new.vue pattern).
const exportFormatModel = computed<string>({
  get: () => exportFormat.value,
  set: (value) => {
    exportFormat.value = value as AuditExportFormat
  },
})
const packFormatModel = computed<string>({
  get: () => packFormat.value,
  set: (value) => {
    packFormat.value = value as EvidencePackFormat
  },
})
const exportOutcomeModel = computed<string>({
  get: () => exportOutcome.value,
  set: (value) => {
    exportOutcome.value = value as OutcomeFilter
  },
})

const formatOptions: readonly AuditExportFormat[] = ['csv', 'jsonl']
const packFormatOptions: readonly EvidencePackFormat[] = ['zip', 'json']
const formatSelectOptions = computed(() =>
  formatOptions.map((value) => ({ value, label: value.toUpperCase() })),
)
const packFormatSelectOptions = computed(() =>
  packFormatOptions.map((value) => ({ value, label: value.toUpperCase() })),
)
const outcomeOptions = computed(() => [
  { value: '', label: t('observability.outcome_any') },
  { value: 'succeeded', label: t('observability.outcome_succeeded') },
  { value: 'denied', label: t('observability.outcome_denied') },
  { value: 'failed', label: t('observability.outcome_failed') },
])

function exportFilters(): AuditExportFilters {
  return {
    format: exportFormat.value,
    ...(exportFrom.value && { from: exportFrom.value }),
    ...(exportTo.value && { to: exportTo.value }),
    ...(exportActionFilter.value.trim() && { action: exportActionFilter.value.trim() }),
    ...(exportOutcome.value && { outcome: exportOutcome.value }),
  }
}

const packFilters = computed<ComplianceEvidencePackFilters>(() => ({
  format: packFormat.value,
  ...(packFrom.value && { from: packFrom.value }),
  ...(packTo.value && { to: packTo.value }),
  ...(packCorrelationId.value.trim() && { correlation_id: packCorrelationId.value.trim() }),
}))

const canSubmitEvidence = computed(() => canSubmitEvidencePack(packFilters.value))

const activeAction = computed(() =>
  activeFlow.value === 'evidence' ? evidenceAction : exportAction,
)
const dialogOpen = computed(() => activeFlow.value !== null)
const dialogTitle = computed(() =>
  activeFlow.value === 'evidence'
    ? t('observability.evidence_pack_title')
    : t('observability.export_title'),
)
// Impact summary + step-up notice live in the adapted observability.*_desc copy.
const dialogDescription = computed(() =>
  activeFlow.value === 'evidence'
    ? t('observability.evidence_pack_desc')
    : t('observability.export_desc'),
)
const dialogError = computed(() =>
  activeAction.value.failure.value ? t('common.error_generic') : null,
)

function onTriggerExport(): void {
  exportAction.reset()
  activeFlow.value = 'export'
}
function onTriggerEvidence(): void {
  evidenceAction.reset()
  activeFlow.value = 'evidence'
}

async function onConfirm(): Promise<void> {
  if (activeFlow.value === 'export') {
    const result = await exportAction.run(() => observabilityApi.exportAuditTrail(exportFilters()))
    // Failure stays visible in the dialog (REF + safe copy + step-up); no download.
    if (result === null) return
    // Client-only download; the BlobResponse is consumed here and discarded — it
    // is never assigned to a ref/store/storage, so it cannot enter any payload.
    triggerBlobDownload(result, auditExportFallbackName(exportFormat.value))
  } else if (activeFlow.value === 'evidence') {
    const result = await evidenceAction.run(() =>
      observabilityApi.generateEvidencePack(packFilters.value),
    )
    if (result === null) return
    triggerBlobDownload(result, evidencePackFallbackName(packFormat.value))
  }
  activeFlow.value = null
  emit('done')
}

function onCancel(): void {
  activeFlow.value = null
  exportAction.reset()
  evidenceAction.reset()
}
</script>

<template>
  <section v-if="canExport" class="export-panel" data-testid="compliance-export-panel">
    <div class="export-panel__card">
      <h3 class="export-panel__title">{{ t('observability.export_title') }}</h3>
      <p class="export-panel__impact">{{ t('observability.export_desc') }}</p>
      <UiFormField id="export-format" :label="t('observability.format')">
        <UiSelect
          v-model="exportFormatModel"
          data-testid="export-format"
          :options="formatSelectOptions"
        />
      </UiFormField>
      <UiFormField id="export-from" :label="t('observability.from')">
        <UiInput v-model="exportFrom" data-testid="export-from" type="date" />
      </UiFormField>
      <UiFormField id="export-to" :label="t('observability.to')">
        <UiInput v-model="exportTo" type="date" />
      </UiFormField>
      <UiFormField id="export-action" :label="t('observability.action')">
        <UiInput v-model="exportActionFilter" />
      </UiFormField>
      <UiFormField id="export-outcome" :label="t('observability.outcome')">
        <UiSelect v-model="exportOutcomeModel" :options="outcomeOptions" />
      </UiFormField>
      <!-- Operational export → accent/primary trigger, never danger red. Clicking
           opens the impact dialog (no form-submit: the dialog gates the API). -->
      <UiButton
        type="button"
        data-testid="export-submit"
        :disabled="exportAction.isSubmitting.value"
        @click="onTriggerExport"
      >
        {{ t('observability.btn_export') }}
      </UiButton>
    </div>

    <div class="export-panel__card">
      <h3 class="export-panel__title">{{ t('observability.evidence_pack_title') }}</h3>
      <p class="export-panel__impact">{{ t('observability.evidence_pack_desc') }}</p>
      <UiFormField id="pack-format" :label="t('observability.pack_format')">
        <UiSelect v-model="packFormatModel" :options="packFormatSelectOptions" />
      </UiFormField>
      <UiFormField id="pack-from" :label="t('observability.from')">
        <UiInput v-model="packFrom" type="date" />
      </UiFormField>
      <UiFormField id="pack-to" :label="t('observability.to')">
        <UiInput v-model="packTo" type="date" />
      </UiFormField>
      <UiFormField
        id="pack-correlation"
        :label="t('observability.correlation_id_label')"
        :hint="canSubmitEvidence ? undefined : t('observability.evidence_pack_hint')"
      >
        <UiInput v-model="packCorrelationId" data-testid="evidence-correlation" />
      </UiFormField>
      <UiButton
        type="button"
        data-testid="evidence-submit"
        :disabled="!canSubmitEvidence || evidenceAction.isSubmitting.value"
        @click="onTriggerEvidence"
      >
        {{ t('observability.btn_generate_pack') }}
      </UiButton>
    </div>

    <PrivilegedActionDialog
      :open="dialogOpen"
      :title="dialogTitle"
      :description="dialogDescription"
      :confirm-label="t('common.btn_confirm')"
      :cancel-label="t('common.btn_cancel')"
      :submitting="activeAction.isSubmitting.value"
      :step-up-url="activeAction.stepUpUrl.value"
      :step-up-label="t('observability.btn_step_up')"
      :error-message="dialogError"
      :request-id="activeAction.requestId.value"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </section>
</template>

<style scoped>
.export-panel {
  display: grid;
  gap: 16px;
}
@media (min-width: 48rem) {
  .export-panel {
    grid-template-columns: 1fr 1fr;
  }
}
.export-panel__card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
}
.export-panel__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.export-panel__impact {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
</style>
