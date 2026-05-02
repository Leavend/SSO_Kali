<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import Modal from './Modal.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
}>(), {
  confirmLabel: 'Konfirmasi',
  cancelLabel: 'Batal',
  danger: false,
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

function close() {
  if (!props.loading) {
    emit('update:modelValue', false)
  }
}

function handleConfirm() {
  emit('confirm')
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    size="sm"
    :closable="!loading"
    :close-on-backdrop="!loading"
    :close-on-escape="!loading"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="confirm-dialog">
      <div v-if="danger" class="confirm-dialog__icon">
        <AlertTriangle :size="24" aria-hidden="true" />
      </div>
      <h3 class="confirm-dialog__title">{{ title }}</h3>
      <p v-if="message" class="confirm-dialog__message">{{ message }}</p>
    </div>

    <template #footer>
      <button
        type="button"
        class="button button--secondary"
        :disabled="loading"
        @click="close"
      >
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="button"
        :class="danger ? 'button--danger' : 'button--primary'"
        :disabled="loading"
        @click="handleConfirm"
      >
        <span v-if="loading" class="spinner spinner--sm" aria-hidden="true" />
        <template v-else>{{ confirmLabel }}</template>
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.confirm-dialog {
  display: grid;
  gap: var(--space-4);
  text-align: center;
}

.confirm-dialog__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto;
  color: var(--status-warning);
  background: var(--status-warning-soft);
  border-radius: var(--radius-full);
}

.confirm-dialog__title {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-lg);
  font-weight: 700;
}

.confirm-dialog__message {
  margin: 0;
  color: var(--admin-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}
</style>
