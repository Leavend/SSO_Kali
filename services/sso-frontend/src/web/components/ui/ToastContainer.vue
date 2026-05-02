<script setup lang="ts">
import { ref, provide } from 'vue'
import Toast from './Toast.vue'
import type { ToastProps } from './Toast.vue'

const toasts = ref<(ToastProps & { id: string })[]>([])
let toastId = 0

function addToast(toast: Omit<ToastProps, 'id'>) {
  const id = `toast-${++toastId}`
  toasts.value.push({ ...toast, id })
  return id
}

function removeToast(id: string) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    toasts.value.splice(index, 1)
  }
}

function success(title: string, message?: string, duration?: number) {
  return addToast({ type: 'success', title, message, duration })
}

function error(title: string, message?: string, duration?: number) {
  return addToast({ type: 'error', title, message, duration: duration ?? 8000 })
}

function warning(title: string, message?: string, duration?: number) {
  return addToast({ type: 'warning', title, message, duration })
}

function info(title: string, message?: string, duration?: number) {
  return addToast({ type: 'info', title, message, duration })
}

function clear() {
  toasts.value = []
}

defineExpose({ addToast, removeToast, success, error, warning, info, clear })
provide('toast', { success, error, warning, info, removeToast })
</script>

<template>
  <Teleport to="body">
    <div
      class="toast-container"
      aria-live="polite"
      aria-label="Notifications"
    >
      <TransitionGroup name="toast-list" tag="div" class="toast-stack">
        <Toast
          v-for="toast in toasts"
          :key="toast.id"
          v-bind="toast"
          @dismiss="removeToast"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.toast-list-enter-active {
  animation: slide-in-right 0.25s var(--ease-out);
}

.toast-list-leave-active {
  animation: slide-out-right 0.2s var(--ease-out);
}

.toast-list-move {
  transition: transform 0.25s var(--ease-out);
}

@media (max-width: 480px) {
  .toast-container {
    top: var(--space-2);
    right: var(--space-2);
    left: var(--space-2);
  }

  .toast-stack {
    gap: var(--space-2);
  }
}
</style>
