<script setup lang="ts">
import { AlertTriangle, Ban, RefreshCw, ShieldAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import { formatSupportReference, redactTechnicalIdentifiers } from '@/lib/display-identifiers'

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

const safeDescription = computed(() => redactTechnicalIdentifiers(props.description))
const supportReference = computed(() => formatSupportReference(props.requestId))
</script>

<template>
  <component
    :is="standalone ? 'main' : 'section'"
    :class="standalone ? 'admin-shell admin-shell--state' : 'admin-state-inline'"
  >
    <div class="admin-shell__panel">
      <div class="ui-status-view" role="alert">
        <div class="ui-status-view__icon" aria-hidden="true">
          <Ban v-if="tone === 'forbidden'" :size="30" />
          <ShieldAlert v-else-if="tone === 'step_up'" :size="30" />
          <RefreshCw v-else-if="tone === 'api'" :size="30" />
          <AlertTriangle v-else :size="30" />
        </div>
        <span class="eyebrow">{{ eyebrow }}</span>
        <h1>{{ title }}</h1>
        <p>{{ safeDescription }}</p>
        <dl v-if="supportReference" class="ui-status-view__evidence">
          <div>
            <dt>Kode referensi</dt>
            <dd>{{ supportReference }}</dd>
          </div>
        </dl>
        <div class="action-row" :aria-label="`${eyebrow} actions`">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </component>
</template>
