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
    :class="['ui-status-view', `ui-status-view--${tone}`, { 'ui-status-view--standalone': standalone }]"
  >
    <template v-if="standalone">
      <div class="ui-status-view__glow" aria-hidden="true" />
      <!-- Product name, locale-invariant — matches the sidebar brand in admin.vue. -->
      <p class="ui-status-view__brand">
        <span class="ui-status-view__brand-mark" aria-hidden="true">◆</span>
        SSO Console
      </p>
    </template>
    <div class="ui-status-view__panel" role="alert">
      <div :class="['ui-status-view__icon', `ui-status-view__icon--${tone}`]" aria-hidden="true">
        <Ban v-if="tone === 'forbidden'" :size="24" />
        <ShieldAlert v-else-if="tone === 'step_up'" :size="24" />
        <RefreshCw v-else-if="tone === 'api'" :size="24" />
        <AlertTriangle v-else :size="24" />
      </div>
      <span class="ui-status-view__eyebrow">{{ eyebrow }}</span>
      <component :is="standalone ? 'h1' : 'h2'" class="ui-status-view__title">{{
        title
      }}</component>
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
  position: relative;
  isolation: isolate;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 20px;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg);
}
/* Tonal glow colour — component-local custom property per tone; derives from
   theme vars so dark mode adapts without extra declarations. */
.ui-status-view--forbidden,
.ui-status-view--error {
  --status-glow: color-mix(in srgb, var(--danger) 12%, transparent);
}
.ui-status-view--step_up {
  --status-glow: color-mix(in srgb, var(--warning) 12%, transparent);
}
.ui-status-view--api {
  --status-glow: color-mix(in srgb, var(--info) 14%, transparent);
}
.ui-status-view__glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(600px circle at 50% 35%, var(--status-glow), transparent 70%);
}
.ui-status-view__brand {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: 600 0.8125rem/1 var(--font-sans);
  letter-spacing: 0.02em;
  color: var(--fg-2);
}
.ui-status-view__brand-mark {
  font-size: 0.625rem;
  color: var(--accent);
}
.ui-status-view--standalone .ui-status-view__panel {
  padding: 36px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
}
.ui-status-view--standalone .ui-status-view__icon {
  width: 52px;
  height: 52px;
}
.ui-status-view--standalone .ui-status-view__title {
  font-size: 1.75rem;
}
.ui-status-view__panel {
  display: grid;
  justify-items: start;
  gap: 12px;
  width: min(560px, 100%);
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-md);
}
.ui-status-view__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
}
.ui-status-view__icon--forbidden,
.ui-status-view__icon--error {
  background: var(--danger-soft);
  color: var(--danger-soft-fg);
  border: 1px solid var(--danger-soft-border);
}
.ui-status-view__icon--step_up {
  background: var(--warning-soft);
  color: var(--warning-soft-fg);
  border: 1px solid var(--warning-soft-border);
}
.ui-status-view__icon--api {
  background: var(--info-soft);
  color: var(--info-soft-fg);
  border: 1px solid var(--info-soft-border);
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
