/**
 * useNetworkStatus — composable FR-007 global network detection.
 *
 * Detects online/offline state via `navigator.onLine` + window events.
 * Used by App.vue or layout to show global offline banner.
 */

import { ref, type Ref } from 'vue'

export type UseNetworkStatusReturn = {
  /** Reactive online state. */
  readonly isOnline: Ref<boolean>
  /** Manual cleanup (for non-component usage). In components, use onBeforeUnmount. */
  cleanup: () => void
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const isOnline = ref<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  function handleOnline(): void {
    isOnline.value = true
  }

  function handleOffline(): void {
    isOnline.value = false
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }

  function cleanup(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }

  return { isOnline, cleanup }
}
