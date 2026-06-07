import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useAutoRefresh } from '../useAutoRefresh'

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('calls task periodically', async () => {
    const task = vi.fn<() => void>()
    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({ intervalMs: 1000, task, jitterMs: 0 })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)
    expect(task).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('skips task execution when enabled() returns false', async () => {
    const task = vi.fn<() => void>()
    let isEnabled = true

    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({
          intervalMs: 1000,
          task,
          jitterMs: 0,
          enabled: () => isEnabled,
        })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)

    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)

    isEnabled = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1) // Still 1

    isEnabled = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('skips task execution when document is hidden', async () => {
    const task = vi.fn<() => void>()
    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({ intervalMs: 1000, task, jitterMs: 0 })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)

    await vi.advanceTimersByTimeAsync(1000)
    expect(task).not.toHaveBeenCalled()

    hiddenSpy.mockRestore()
    wrapper.unmount()
  })

  it('guards re-entrancy when the task is slow', async () => {
    let resolveTask: (() => void) | null = null
    const task = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveTask = resolve
        }),
    )

    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({ intervalMs: 1000, task, jitterMs: 0 })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)

    // Trigger first tick
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1)
    expect(resolveTask).not.toBeNull()

    // Trigger next tick while first task is still running
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(1) // No overlap, not called again

    // Resolve first task
    if (resolveTask) {
      ;(resolveTask as () => void)()
    }
    await vi.advanceTimersByTimeAsync(0) // Let promise resolve

    // Trigger next tick after resolution
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)

    wrapper.unmount()
  })

  it('triggers catch-up task on visibility restoration if previously hidden', async () => {
    const task = vi.fn<() => void>()
    let isHidden = false
    const hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => isHidden)

    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({ intervalMs: 1000, task, jitterMs: 0 })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)

    // Hidden state
    isHidden = true
    const changeEvent = new Event('visibilitychange')
    document.dispatchEvent(changeEvent)

    // Tick happens while hidden
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).not.toHaveBeenCalled()

    // Restoration
    isHidden = false
    document.dispatchEvent(changeEvent)

    // Immediate catch-up refresh
    await vi.advanceTimersByTimeAsync(0)
    expect(task).toHaveBeenCalledTimes(1)

    hiddenSpy.mockRestore()
    wrapper.unmount()
  })

  it('clears timer on component unmount', async () => {
    const task = vi.fn<() => void>()
    const TestComponent = defineComponent({
      setup() {
        useAutoRefresh({ intervalMs: 1000, task, jitterMs: 0 })
        return {}
      },
      template: '<div></div>',
    })

    const wrapper = mount(TestComponent)
    wrapper.unmount()

    await vi.advanceTimersByTimeAsync(2000)
    expect(task).not.toHaveBeenCalled()
  })
})
