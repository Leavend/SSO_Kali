<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-vue-next'

defineOptions({
  name: 'AdminToast',
})

export interface ToastProps {
  id: string
  type?: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  dismissible?: boolean
}

const props = withDefaults(defineProps<ToastProps>(), {
  type: 'info',
  duration: 5000,
  dismissible: true,
})

const emit = defineEmits<{
  dismiss: [id: string]
}>()

const isVisible = ref(false)
const isLeaving = ref(false)
let dismissTimer: number | undefined
let leaveTimer: number | undefined

const icon = computed(() => {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }
  return icons[props.type]
})

function dismiss() {
  if (isLeaving.value) return

  isLeaving.value = true
  if (dismissTimer !== undefined) {
    window.clearTimeout(dismissTimer)
  }

  leaveTimer = window.setTimeout(() => {
    emit('dismiss', props.id)
  }, 200)
}

onMounted(() => {
  requestAnimationFrame(() => {
    isVisible.value = true
  })

  if (props.duration > 0) {
    dismissTimer = window.setTimeout(dismiss, props.duration)
  }
})

onUnmounted(() => {
  if (dismissTimer !== undefined) {
    window.clearTimeout(dismissTimer)
  }
  if (leaveTimer !== undefined) {
    window.clearTimeout(leaveTimer)
  }
})
</script>

<template>
  <div
    class="toast"
    :class="[
      `toast--${type}`,
      { 'toast--visible': isVisible, 'toast--leaving': isLeaving }
    ]"
    role="alert"
    :aria-live="type === 'error' ? 'assertive' : 'polite'"
  >
    <component :is="icon" :size="20" class="toast__icon" aria-hidden="true" />
    <div class="toast__content">
      <p class="toast__title">{{ title }}</p>
      <p v-if="message" class="toast__message">{{ message }}</p>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="toast__dismiss"
      aria-label="Dismiss notification"
      @click="dismiss"
    >
      <X :size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 300px;
  max-width: 420px;
  padding: var(--space-4);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 25px var(--admin-shadow-lg), 0 10px 10px var(--admin-shadow);
  opacity: 0;
  transform: translateX(100%);
  transition:
    opacity 0.2s var(--ease-out),
    transform 0.2s var(--ease-out);
}

.toast--visible {
  opacity: 1;
  transform: translateX(0);
}

.toast--leaving {
  opacity: 0;
  transform: translateX(100%);
}

.toast__icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast--success .toast__icon { color: var(--status-success); }
.toast--error .toast__icon { color: var(--status-danger); }
.toast--warning .toast__icon { color: var(--status-warning); }
.toast--info .toast__icon { color: var(--status-info); }

.toast__content {
  flex: 1;
  min-width: 0;
}

.toast__title {
  margin: 0;
  color: var(--admin-ink);
  font-size: var(--text-sm);
  font-weight: 700;
  line-height: var(--leading-normal);
}

.toast__message {
  margin: var(--space-1) 0 0;
  color: var(--admin-muted);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
}

.toast__dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
  flex-shrink: 0;
}

.toast__dismiss:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

@media (max-width: 480px) {
  .toast {
    min-width: auto;
    width: calc(100vw - var(--space-8));
    max-width: none;
  }
}
</style>
