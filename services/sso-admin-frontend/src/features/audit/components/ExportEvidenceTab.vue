<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { Download, ShieldCheck } from 'lucide-vue-next'
import UiFormField from '@/components/ui/UiFormField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useSessionStore } from '@/stores/session.store'
import { useAuditStore } from '@/features/audit/stores/audit.store'
import type { AuditExportFilters, ComplianceEvidencePackFilters } from '../types'

const store = useAuditStore()
const session = useSessionStore()
const { t } = useI18n()

const canExportAudit = computed(() => session.hasPermission('admin.audit.export'))
const canGenerateEvidencePack = computed(() => session.hasPermission('admin.audit.export'))

const exportFormat = ref<'csv' | 'jsonl'>('csv')
const exportFrom = ref('')
const exportTo = ref('')
const exportAction = ref('')
const exportOutcome = ref('')

async function submitExport(): Promise<void> {
  const action = exportAction.value.trim()
  const outcome = exportOutcome.value.trim()
  const filters: AuditExportFilters = {
    format: exportFormat.value,
    ...(exportFrom.value && { from: exportFrom.value }),
    ...(exportTo.value && { to: exportTo.value }),
    ...(action && { action }),
    ...(outcome && { outcome }),
  }
  await store.exportEvents(filters)
}

const packFormat = ref<'zip' | 'json'>('zip')
const packFrom = ref('')
const packTo = ref('')
const packCorrelationId = ref('')

const canSubmitEvidencePack = computed(
  () => (packFrom.value !== '' && packTo.value !== '') || packCorrelationId.value.trim() !== '',
)

async function submitEvidencePack(): Promise<void> {
  if (!canSubmitEvidencePack.value) return
  const correlationId = packCorrelationId.value.trim()
  const filters: ComplianceEvidencePackFilters = {
    format: packFormat.value,
    ...(packFrom.value && { from: packFrom.value }),
    ...(packTo.value && { to: packTo.value }),
    ...(correlationId && { correlation_id: correlationId }),
  }
  await store.generateEvidencePack(filters)
}
</script>

<template>
  <div class="audit-grid audit-grid-2">
    <!-- Export Section -->
    <section v-if="canExportAudit" class="ui-card space-y-4" aria-labelledby="export-title">
      <div class="flex items-center gap-2">
        <Download class="size-5 text-primary" />
        <h2 id="export-title" class="text-lg font-bold">{{ t('audit.export_title') }}</h2>
      </div>
      <p class="text-sm text-muted-foreground leading-relaxed">
        {{ t('audit.export_desc') }}
      </p>

      <fieldset class="border border-border rounded-xl p-4 bg-muted space-y-2">
        <legend class="px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {{ t('audit.format') }}
        </legend>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              v-model="exportFormat"
              type="radio"
              name="export-format"
              value="csv"
              class="accent-primary"
            />
            <span>CSV</span>
          </label>
          <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              v-model="exportFormat"
              type="radio"
              name="export-format"
              value="jsonl"
              class="accent-primary"
            />
            <span>JSONL</span>
          </label>
        </div>
      </fieldset>

      <div class="audit-grid audit-grid-2">
        <UiFormField id="export-from" :label="t('audit.from')">
          <UiInput id="export-from" name="export-from" v-model="exportFrom" type="date" />
        </UiFormField>
        <UiFormField id="export-to" :label="t('audit.to')">
          <UiInput id="export-to" name="export-to" v-model="exportTo" type="date" />
        </UiFormField>
        <UiFormField id="export-action" :label="t('audit.action')">
          <UiInput
            id="export-action"
            name="export-action"
            v-model="exportAction"
            autocomplete="off"
          />
        </UiFormField>
        <UiFormField id="export-outcome" :label="t('audit.outcome')">
          <UiInput
            id="export-outcome"
            name="export-outcome"
            v-model="exportOutcome"
            autocomplete="off"
          />
        </UiFormField>
      </div>

      <div class="pt-2">
        <UiButton
          variant="primary"
          class="audit-export-button"
          :disabled="store.actionStatus === 'loading'"
          @click="submitExport"
        >
          {{ store.actionStatus === 'loading' ? 'Exporting...' : t('audit.btn_export') }}
        </UiButton>
      </div>
      <p
        v-if="store.actionStatus === 'step_up_required'"
        class="text-sm font-bold text-destructive"
        role="alert"
      >
        {{ store.errorMessage }}
      </p>
    </section>

    <!-- Evidence Pack Section -->
    <section
      v-if="canGenerateEvidencePack"
      class="ui-card space-y-4"
      aria-labelledby="evidence-pack-title"
    >
      <div class="flex items-center gap-2">
        <ShieldCheck class="size-5 text-primary" />
        <h2 id="evidence-pack-title" class="text-lg font-bold">
          {{ t('audit.evidence_pack_title') }}
        </h2>
      </div>
      <p class="text-sm text-muted-foreground leading-relaxed">
        {{ t('audit.evidence_pack_desc') }}
      </p>

      <fieldset class="border border-border rounded-xl p-4 bg-muted space-y-2">
        <legend class="px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {{ t('audit.pack_format') }}
        </legend>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              v-model="packFormat"
              type="radio"
              name="evidence-pack-format"
              value="zip"
              class="accent-primary"
            />
            <span>ZIP</span>
          </label>
          <label class="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              v-model="packFormat"
              type="radio"
              name="evidence-pack-format"
              value="json"
              class="accent-primary"
            />
            <span>JSON</span>
          </label>
        </div>
      </fieldset>

      <div class="audit-grid audit-grid-2">
        <UiFormField id="evidence-pack-from" :label="t('audit.from')">
          <UiInput
            id="evidence-pack-from"
            name="evidence-pack-from"
            v-model="packFrom"
            type="date"
          />
        </UiFormField>
        <UiFormField id="evidence-pack-to" :label="t('audit.to')">
          <UiInput
            id="evidence-pack-to"
            name="evidence-pack-to"
            v-model="packTo"
            type="date"
          />
        </UiFormField>
        <UiFormField
          id="evidence-pack-correlation-id"
          :label="t('audit.correlation_id_label')"
          class="col-span-full"
        >
          <UiInput
            id="evidence-pack-correlation-id"
            name="evidence-pack-correlation-id"
            v-model="packCorrelationId"
            autocomplete="off"
          />
        </UiFormField>
      </div>

      <p
        v-if="!canSubmitEvidencePack"
        class="text-xs text-muted-foreground leading-relaxed italic bg-muted p-2 rounded-lg"
      >
        {{ t('audit.evidence_pack_hint') }}
      </p>

      <div class="pt-2">
        <UiButton
          variant="primary"
          class="compliance-evidence-pack-button"
          :disabled="store.actionStatus === 'loading' || !canSubmitEvidencePack"
          @click="submitEvidencePack"
        >
          {{
            store.actionStatus === 'loading' ? 'Generating...' : t('audit.btn_generate_pack')
          }}
        </UiButton>
      </div>
      <p
        v-if="store.actionStatus === 'step_up_required'"
        class="text-sm font-bold text-destructive"
        role="alert"
      >
        {{ store.errorMessage }}
      </p>
    </section>
  </div>
</template>
