import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Reactive `window.matchMedia` wrapper.
 *
 * Returns a ref that tracks whether `query` currently matches, updating on
 * viewport changes. SSR/test-safe: when `window.matchMedia` is unavailable the
 * ref stays `false` and no listener is registered, so the composable never
 * throws in the BFF render path or in jsdom without a matchMedia stub.
 *
 * Used to switch the Clients master–detail panel between an inline pane
 * (wide) and a focus-trapping drawer (≤920px) without re-fetching the
 * selected client.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false)

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches
  }

  const mediaQuery = window.matchMedia(query)
  matches.value = mediaQuery.matches

  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches
  }

  onMounted(() => {
    // Re-sync on mount in case the viewport changed before the listener attached.
    matches.value = mediaQuery.matches
    mediaQuery.addEventListener('change', onChange)
  })

  onBeforeUnmount(() => {
    mediaQuery.removeEventListener('change', onChange)
  })

  return matches
}
