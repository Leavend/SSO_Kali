import { computed, ref } from 'vue'

export type ToastTone = 'success' | 'error' | 'step_up' | 'info'

export type ToastInput = {
  readonly tone: ToastTone
  readonly title: string
  readonly description?: string
  readonly requestId?: string
}

export type Toast = ToastInput & {
  readonly id: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  const items = computed<readonly Toast[]>(() => toasts.value)

  function pushToast(input: ToastInput): string {
    const id = `toast-${++nextId}`
    toasts.value = [...toasts.value, { ...input, id }]
    return id
  }

  function dismissToast(id: string): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function clearToasts(): void {
    toasts.value = []
  }

  return { toasts: items, pushToast, dismissToast, clearToasts }
}
