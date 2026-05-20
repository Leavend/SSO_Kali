/**
 * useAuthSteps — generic step-machine for multi-step Aurora auth pages.
 *
 * Goals:
 *   - Type-safe step ids (literal union) so each page locks down its sequence.
 *   - Pure UI state — no backend calls. Step transitions are gated by per-step
 *     validators provided by the page (e.g. `isEmail(value)`).
 *   - Auto-focus on advance + auto-blank a sensitive field on back (e.g. wipe
 *     password when user returns to email step), so multi-step flows don't
 *     accidentally leak state across steps.
 *
 * Frozen contracts:
 *   - Composable does NOT submit to backend. Final-step submit is delegated
 *     to the page's existing composable (`useLoginForm`, register handler,
 *     etc.) so anti-enumeration and server-side validation are preserved.
 */

import { computed, nextTick, ref } from 'vue'

export interface AuthStepDefinition<S extends string> {
  /** Step id used in switch/template. */
  readonly id: S
  /**
   * True when the current input(s) for this step satisfy local UX validation
   * (format only). Backend validation is handled by the page.
   */
  readonly canAdvance: () => boolean
  /**
   * Optional cleanup when the user navigates back FROM this step. Receives
   * the previous step id we're returning to.
   */
  readonly onLeave?: (previous: S) => void
  /**
   * Element-id (or ref-resolver) to focus when this step becomes active.
   * Helps screen-reader users follow the new step (WCAG 2.4.3).
   */
  readonly focusId?: string
}

export interface UseAuthStepsApi<S extends string> {
  /** Currently active step id. */
  readonly current: import('vue').Ref<S>
  /** Whether the active step is the last one (terminal). */
  readonly isLast: import('vue').ComputedRef<boolean>
  /** Whether the active step can advance now (validator passed). */
  readonly canAdvance: import('vue').ComputedRef<boolean>
  /** Advance to next step, returns true if a transition happened. */
  readonly next: () => boolean
  /** Go back to previous step, returns true if a transition happened. */
  readonly back: () => boolean
  /** Hard-jump to a step (used for error recovery). */
  readonly goTo: (target: S) => void
  /** Index of the active step in the sequence (0-based). */
  readonly index: import('vue').ComputedRef<number>
}

export function useAuthSteps<S extends string>(
  steps: readonly AuthStepDefinition<S>[],
): UseAuthStepsApi<S> {
  if (steps.length === 0) {
    throw new Error('useAuthSteps requires at least one step definition.')
  }

  const current = ref<S>(steps[0]!.id) as import('vue').Ref<S>
  const ids = steps.map((s) => s.id)

  const index = computed<number>(() => ids.indexOf(current.value))
  const isLast = computed<boolean>(() => index.value === steps.length - 1)
  const canAdvance = computed<boolean>(() => {
    const def = steps[index.value]
    return def ? def.canAdvance() : false
  })

  function focusStep(stepId: S): void {
    const def = steps.find((s) => s.id === stepId)
    if (!def?.focusId) return
    void nextTick(() => {
      if (typeof document === 'undefined') return
      window.setTimeout(() => {
        if (current.value !== stepId) return
        const target = document.getElementById(def.focusId!)
        if (target instanceof HTMLElement) target.focus()
      }, 360)
    })
  }

  function next(): boolean {
    if (!canAdvance.value) return false
    if (isLast.value) return false
    const target = steps[index.value + 1]
    if (!target) return false
    current.value = target.id
    focusStep(target.id)
    return true
  }

  function back(): boolean {
    if (index.value === 0) return false
    const previous = steps[index.value - 1]
    const leaving = steps[index.value]
    if (!previous || !leaving) return false
    leaving.onLeave?.(previous.id)
    current.value = previous.id
    focusStep(previous.id)
    return true
  }

  function goTo(target: S): void {
    if (!ids.includes(target)) return
    current.value = target
    focusStep(target)
  }

  return { current, isLast, canAdvance, next, back, goTo, index }
}
