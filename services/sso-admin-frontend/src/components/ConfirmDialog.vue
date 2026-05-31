<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
}

interface Emits {
  (event: 'confirm'): void
  (event: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: true,
})
const emit = defineEmits<Emits>()
const dialogRef = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  async (open): Promise<void> => {
    if (!open) return
    await nextTick()
    dialogRef.value?.focus()
  },
)

function confirm(): void {
  emit('confirm')
}

function cancel(): void {
  emit('cancel')
}
</script>

<template>
  <div v-if="open" class="confirm-dialog-backdrop" @click.self="cancel">
      <section
        ref="dialogRef"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabindex="-1"
        @keydown.esc="cancel"
      >
        <p class="eyebrow">Konfirmasi aksi admin</p>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
        <p id="confirm-dialog-description">{{ description }}</p>
        <div class="action-row compact-actions">
          <button
            data-testid="confirm-dialog-cancel"
            class="secondary-action"
            type="button"
            @click="cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            data-testid="confirm-dialog-confirm"
            :class="danger ? 'danger-action' : 'primary-action'"
            type="button"
            @click="confirm"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </section>
  </div>
</template>
