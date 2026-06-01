<script setup lang="ts">
import { AlertTriangle, Ban, RefreshCw, ShieldAlert } from 'lucide-vue-next'

type StatusTone = 'error' | 'forbidden' | 'step_up' | 'api'

interface Props {
  readonly tone: StatusTone
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly requestId?: string
  readonly standalone?: boolean
}

withDefaults(defineProps<Props>(), {
  requestId: undefined,
  standalone: true,
})
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
        <p>{{ description }}</p>
        <dl v-if="requestId" class="ui-status-view__evidence">
          <div>
            <dt>Correlation ID</dt>
            <dd>{{ requestId }}</dd>
          </div>
        </dl>
        <div class="action-row" :aria-label="`${eyebrow} actions`">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </component>
</template>
