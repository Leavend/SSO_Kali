<script setup lang="ts">
import { CheckCircle2, Info, ShieldAlert, X, XCircle } from 'lucide-vue-next'
import { formatSupportReference } from '@/lib/display-identifiers'
import { useToast } from './useToast'

const { toasts, dismissToast } = useToast()
</script>

<template>
  <div class="ui-toast-region" aria-label="Admin notifications">
    <article
      v-for="toast in toasts"
      :key="toast.id"
      class="ui-toast"
      :class="`ui-toast--${toast.tone}`"
      role="status"
    >
      <CheckCircle2 v-if="toast.tone === 'success'" :size="18" aria-hidden="true" />
      <XCircle v-else-if="toast.tone === 'error'" :size="18" aria-hidden="true" />
      <ShieldAlert v-else-if="toast.tone === 'step_up'" :size="18" aria-hidden="true" />
      <Info v-else :size="18" aria-hidden="true" />
      <div class="ui-toast__body">
        <strong>{{ toast.title }}</strong>
        <p v-if="toast.description">{{ toast.description }}</p>
        <small v-if="toast.requestId"
          >Kode referensi: {{ formatSupportReference(toast.requestId) }}</small
        >
      </div>
      <button
        class="ui-toast__close"
        type="button"
        aria-label="Dismiss notification"
        @click="dismissToast(toast.id)"
      >
        <X :size="16" aria-hidden="true" />
      </button>
    </article>
  </div>
</template>
