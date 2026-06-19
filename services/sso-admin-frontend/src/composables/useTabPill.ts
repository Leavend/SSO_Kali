import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue'

type UseTabPillOptions = {
  readonly containerRef: Ref<HTMLElement | null>
  readonly activeSelector: string
  readonly scrollActiveIntoView?: boolean
}

export function useTabPill({
  containerRef,
  activeSelector,
  scrollActiveIntoView = false,
}: UseTabPillOptions) {
  const pillStyle = ref({
    left: '0px',
    width: '0px',
    opacity: '0',
  })

  let isDisposed = false
  let updateTimeout: number | null = null

  function getActiveButton(): HTMLElement | null {
    return containerRef.value?.querySelector(activeSelector) ?? null
  }

  function updatePillPosition(): void {
    if (isDisposed) return

    const activeBtn = getActiveButton()
    if (activeBtn) {
      pillStyle.value = {
        left: `${activeBtn.offsetLeft}px`,
        width: `${activeBtn.offsetWidth}px`,
        opacity: '1',
      }
      if (scrollActiveIntoView && typeof activeBtn.scrollIntoView === 'function') {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
      return
    }

    pillStyle.value = {
      ...pillStyle.value,
      opacity: '0',
    }
  }

  function clearScheduledUpdate(): void {
    if (updateTimeout === null) return
    window.clearTimeout(updateTimeout)
    updateTimeout = null
  }

  function schedulePillUpdate(delayMs = 100): void {
    clearScheduledUpdate()
    updateTimeout = window.setTimeout(() => {
      updateTimeout = null
      updatePillPosition()
    }, delayMs)
  }

  function cleanup(): void {
    isDisposed = true
    clearScheduledUpdate()
    window.removeEventListener('resize', updatePillPosition)
  }

  onMounted(() => {
    void nextTick(() => {
      updatePillPosition()
    })
    schedulePillUpdate()
    window.addEventListener('resize', updatePillPosition)
  })

  onUnmounted(cleanup)

  return {
    pillStyle,
    updatePillPosition,
    schedulePillUpdate,
    cleanup,
  }
}
