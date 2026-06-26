import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'

type CountUpSource = number | Ref<number>

type UseCountUpOptions = {
  /** Animation length in milliseconds. */
  readonly durationMs?: number
  /**
   * Override for reduced-motion detection. When `true` the animation is skipped
   * and the final value is shown instantly. Defaults to the user's
   * `prefers-reduced-motion` setting (and to instant when the platform lacks
   * `matchMedia`/`requestAnimationFrame`, e.g. SSR or jsdom test runs).
   */
  readonly reducedMotion?: boolean
}

type UseCountUpReturn = {
  /** Reactive, animated display value (always an integer). */
  readonly display: Ref<number>
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

function canAnimate(): boolean {
  return typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
}

function resolve(source: CountUpSource): number {
  return typeof source === 'number' ? source : source.value
}

// Ease-out cubic: fast start, gentle settle — reads as a confident count-up.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animate a number from 0 up to its target value on mount.
 *
 * Accessibility & correctness guarantees:
 * - The final value is reached exactly (no rounding drift) at the end of the run.
 * - When the user prefers reduced motion — or the platform cannot animate — the
 *   display is set to the final value immediately, so screen readers and test
 *   environments always observe the real number with no transient `0`.
 * - Reactive targets are supported: changing the source restarts the count-up.
 */
export function useCountUp(source: CountUpSource, options: UseCountUpOptions = {}): UseCountUpReturn {
  const { durationMs = 900 } = options
  const reduced = options.reducedMotion ?? prefersReducedMotion()

  // Seed with the final value so the correct number is present before the first
  // frame (and is the only value ever shown when motion is reduced/unavailable).
  const display = ref<number>(resolve(source))

  let frameHandle: number | null = null

  function cancel(): void {
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle)
      frameHandle = null
    }
  }

  function run(): void {
    cancel()
    const target = resolve(source)

    if (reduced || !canAnimate() || target === 0) {
      display.value = target
      return
    }

    const startTime = performance.now()
    display.value = 0

    const step = (now: number): void => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      if (progress >= 1) {
        display.value = target
        frameHandle = null
        return
      }
      display.value = Math.round(easeOutCubic(progress) * target)
      frameHandle = window.requestAnimationFrame(step)
    }

    frameHandle = window.requestAnimationFrame(step)
  }

  onMounted(run)
  onUnmounted(cancel)

  if (typeof source !== 'number') {
    watch(source, run)
  }

  return { display }
}
