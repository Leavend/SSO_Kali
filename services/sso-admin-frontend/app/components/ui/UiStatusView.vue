<script setup lang="ts">
import { AlertTriangle, Ban, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatSupportReference, redactTechnicalIdentifiers } from '@/lib/display-identifiers'
import { useI18n } from '@/composables/useI18n'

type StatusTone = 'error' | 'forbidden' | 'step_up' | 'api'

interface Props {
  readonly tone: StatusTone
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly requestId?: string
  readonly standalone?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  requestId: undefined,
  standalone: true,
})

const { t } = useI18n()
const safeDescription = computed<string>(() => redactTechnicalIdentifiers(props.description))
const supportReference = computed<string | null>(() => formatSupportReference(props.requestId))
</script>

<template>
  <component
    :is="standalone ? 'main' : 'section'"
    :class="['ui-status-view', { 'ui-status-view--standalone': standalone }]"
  >
    <div class="ui-status-view__panel" role="alert">
      <div class="ui-status-view__icon" aria-hidden="true">
        <Ban v-if="tone === 'forbidden'" :size="28" />
        <ShieldAlert v-else-if="tone === 'step_up'" :size="28" />
        <RefreshCw v-else-if="tone === 'api'" :size="28" />
        <AlertTriangle v-else :size="28" />
      </div>
      <span class="ui-status-view__eyebrow">{{ eyebrow }}</span>
      <h1 class="ui-status-view__title">{{ title }}</h1>
      <p class="ui-status-view__desc">{{ safeDescription }}</p>
      <dl v-if="supportReference" class="ui-status-view__evidence">
        <dt>{{ t('common.evidence.ref_code') }}</dt>
        <dd>{{ supportReference }}</dd>
      </dl>
      <div class="ui-status-view__actions">
        <slot name="actions" />
      </div>
    </div>
  </component>
</template>

<style scoped>
.ui-status-view--standalone {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg);
}
.ui-status-view__panel {
  display: grid;
  justify-items: start;
  gap: 12px;
  width: min(560px, 100%);
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
}
.ui-status-view__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-status-view__eyebrow {
  font: 600 0.6875rem/1 var(--font-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ui-status-view__title {
  margin: 0;
  font: 600 1.375rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.ui-status-view__desc {
  margin: 0;
  max-width: 52ch;
  font: 400 0.875rem/1.6 var(--font-sans);
  color: var(--fg-2);
}
.ui-status-view__evidence {
  display: grid;
  gap: 2px;
  margin: 4px 0 0;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-status-view__evidence dt {
  font: 600 0.625rem/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.ui-status-view__evidence dd {
  margin: 0;
  font: 400 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
}
.ui-status-view__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
</style>
