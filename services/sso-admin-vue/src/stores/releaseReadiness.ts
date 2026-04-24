import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ReadinessState = 'ready' | 'guarded' | 'pending'

export interface ReadinessItem {
  readonly detail: string
  readonly id: string
  readonly label: string
  readonly state: ReadinessState
}

const initialItems: ReadinessItem[] = [
  {
    id: 'parallel-runtime',
    label: 'Parallel runtime',
    state: 'ready',
    detail: 'Vue control-plane berjalan sebagai canary tanpa mengganti Next.js live.',
  },
  {
    id: 'rollback-path',
    label: 'Rollback path',
    state: 'guarded',
    detail: 'Proxy dapat diarahkan kembali ke service lama tanpa perubahan database.',
  },
  {
    id: 'auth-boundary',
    label: 'Auth boundary',
    state: 'pending',
    detail: 'Callback dan token exchange tetap server-side sampai BFF Laravel siap.',
  },
]

export const useReleaseReadinessStore = defineStore('releaseReadiness', () => {
  const items = ref<ReadinessItem[]>(initialItems)
  const readyCount = computed(() => items.value.filter((item) => item.state === 'ready').length)

  return { items, readyCount }
})
