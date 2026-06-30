<script setup lang="ts">
import { computed } from 'vue'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import type { ExternalIdpMappingPreview } from '@/types/external-idps.types'

const props = defineProps<{
  readonly preview: ExternalIdpMappingPreview
  readonly safeLabel: string
  readonly unsafeLabel: string
  readonly strategyLabel: string
  readonly mappedLabel: string
  readonly warningsLabel: string
  readonly errorsLabel: string
}>()

// The mapped object is the admin's own sample claims, reflected after the server-side
// mapper ran (token/secret keys already stripped by the backend safeSnapshot).
const mappedJson = computed<string>(() =>
  props.preview.mapped ? JSON.stringify(props.preview.mapped, null, 2) : '—',
)
</script>

<template>
  <div class="mapping-preview" data-testid="idp-preview-result">
    <div class="mapping-preview__head">
      <UiStatusBadge
        :tone="preview.safe_to_link ? 'success' : 'danger'"
        :label="preview.safe_to_link ? safeLabel : unsafeLabel"
      />
      <span class="mapping-preview__strategy"
        >{{ strategyLabel }}: {{ preview.missing_email_strategy }}</span
      >
    </div>

    <h4 class="mapping-preview__h4">{{ mappedLabel }}</h4>
    <pre class="mapping-preview__json">{{ mappedJson }}</pre>

    <div v-if="preview.warnings.length" class="mapping-preview__list mapping-preview__list--warn">
      <h4 class="mapping-preview__h4">{{ warningsLabel }}</h4>
      <ul>
        <li v-for="(warning, index) in preview.warnings" :key="`w-${index}`">{{ warning }}</li>
      </ul>
    </div>

    <div v-if="preview.errors.length" class="mapping-preview__list mapping-preview__list--error">
      <h4 class="mapping-preview__h4">{{ errorsLabel }}</h4>
      <ul>
        <li v-for="(error, index) in preview.errors" :key="`e-${index}`">{{ error }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.mapping-preview {
  display: grid;
  gap: 10px;
}
.mapping-preview__head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mapping-preview__strategy {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.mapping-preview__h4 {
  margin: 0;
  font: 600 0.75rem/1.2 var(--font-sans);
  color: var(--fg);
}
.mapping-preview__json {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  white-space: pre;
}
.mapping-preview__list ul {
  margin: 4px 0 0;
  padding-left: 18px;
  font: 400 0.75rem/1.5 var(--font-sans);
}
.mapping-preview__list--warn {
  color: var(--warning-soft-fg);
}
.mapping-preview__list--error {
  color: var(--danger);
}
</style>
