import { onMounted, onUnmounted } from 'vue'

export type AutoRefreshOptions = {
  readonly intervalMs: number
  readonly task: () => void | Promise<void>
  readonly enabled?: () => boolean // false → skip tick (mis. sedang edit)
  readonly jitterMs?: number // default 0.1*interval
  readonly immediate?: boolean // jalankan sekali saat mount (default false; onMounted load sudah ada)
}

export function useAutoRefresh(opts: AutoRefreshOptions): { stop: () => void; start: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null
  let isRunning = false
  let wasHidden = false
  let isStopped = false

  const getJitter = (): number => {
    const jitterMax = opts.jitterMs ?? 0.1 * opts.intervalMs
    // Random between -jitterMax and +jitterMax
    return (Math.random() * 2 - 1) * jitterMax
  }

  const runTask = async (): Promise<void> => {
    if (isStopped) return
    if (isRunning) return // re-entrancy guard
    if (opts.enabled && !opts.enabled()) return
    if (typeof document !== 'undefined' && document.hidden) return

    isRunning = true
    try {
      await opts.task()
    } finally {
      isRunning = false
    }
  }

  const scheduleNext = (): void => {
    if (isStopped) return
    if (timerId !== null) {
      clearTimeout(timerId)
    }

    const delay = opts.intervalMs + getJitter()
    timerId = setTimeout(
      async () => {
        await runTask()
        scheduleNext()
      },
      Math.max(0, delay),
    )
  }

  const start = (): void => {
    isStopped = false
    scheduleNext()
  }

  const stop = (): void => {
    isStopped = true
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  const handleVisibilityChange = async (): Promise<void> => {
    if (typeof document !== 'undefined') {
      if (document.hidden) {
        wasHidden = true
      } else {
        if (wasHidden) {
          wasHidden = false
          await runTask()
        }
      }
    }
  }

  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    if (opts.immediate) {
      void runTask()
    }
    start()
  })

  onUnmounted(() => {
    stop()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  })

  return { stop, start }
}
