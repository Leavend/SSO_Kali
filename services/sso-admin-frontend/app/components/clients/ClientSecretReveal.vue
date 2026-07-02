<script setup lang="ts">
import { ref } from 'vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useI18n } from '@/composables/useI18n'

interface Props {
  readonly open: boolean
  readonly clientId: string
  readonly secret: string | null
  readonly envSnippet?: string
  readonly isPublic?: boolean
  readonly title: string
  readonly description: string
  readonly warning: string
  readonly copyLabel: string
  readonly clearLabel: string
  readonly closeLabel: string
}

const props = withDefaults(defineProps<Props>(), {
  envSnippet: '',
  isPublic: false,
})

const emit = defineEmits<{ (event: 'close'): void; (event: 'copy'): void }>()

const { t } = useI18n()

// Transient, component-local COPY FEEDBACK only — never the secret itself.
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

async function onCopy(): Promise<void> {
  // Copy the full env block when present (it embeds the SSO_CLIENT_SECRET line);
  // otherwise the bare secret. Read straight from props — never cached/stored.
  const payload = props.envSnippet || props.secret || ''
  try {
    await navigator.clipboard.writeText(payload)
    copyState.value = 'copied'
  } catch {
    // Swallow WITHOUT logging — the secret must never reach a console/log sink.
    copyState.value = 'failed'
  }
  emit('copy')
}

function onClose(): void {
  copyState.value = 'idle'
  emit('close')
}
</script>

<template>
  <UiDialog
    :open="open"
    title-id="client-secret-reveal"
    :title="title"
    :description="description"
    :close-label="closeLabel"
    @close="onClose"
  >
    <div class="secret-reveal">
      <p class="secret-reveal__warning" role="alert" data-testid="client-secret-warning">
        {{ warning }}
      </p>

      <code
        v-if="!isPublic && secret"
        class="secret-reveal__value"
        data-testid="client-secret-value"
        >{{ secret }}</code
      >

      <pre v-if="envSnippet" class="secret-reveal__env" data-testid="client-secret-env">{{
        envSnippet
      }}</pre>

      <p
        v-if="copyState !== 'idle'"
        class="secret-reveal__feedback"
        role="status"
        data-testid="client-secret-copy-feedback"
      >
        {{ copyState === 'copied' ? t('clients.copy_success') : t('clients.copy_failed') }}
      </p>

      <div class="secret-reveal__actions">
        <UiButton
          v-if="secret || envSnippet"
          variant="secondary"
          data-testid="client-secret-copy"
          @click="onCopy"
        >
          {{ copyLabel }}
        </UiButton>
        <UiButton variant="danger" data-testid="client-secret-clear" @click="onClose">
          {{ clearLabel }}
        </UiButton>
      </div>
    </div>
  </UiDialog>
</template>

<style scoped>
.secret-reveal {
  display: grid;
  gap: 14px;
}
.secret-reveal__warning {
  padding: 10px 14px;
  font: 500 0.8125rem/1.5 var(--font-sans);
  color: var(--danger-soft-fg);
  background: var(--danger-soft);
  border: 1px solid var(--danger-soft-border);
  border-radius: var(--r-md);
}
.secret-reveal__value {
  padding: 10px 12px;
  font: 500 0.8125rem/1.4 var(--font-mono);
  color: var(--fg);
  word-break: break-all;
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.secret-reveal__env {
  padding: 12px;
  overflow-x: auto;
  font: 400 0.75rem/1.5 var(--font-mono);
  color: var(--fg);
  background: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.secret-reveal__feedback {
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-2);
}
.secret-reveal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
