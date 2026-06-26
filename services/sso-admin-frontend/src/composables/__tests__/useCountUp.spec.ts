import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from '../useCountUp'

function mountCountUp(value: number | Ref<number>, options = {}) {
  const Test = defineComponent({
    setup() {
      const { display } = useCountUp(value, options)
      return { display }
    },
    template: `<span>{{ display }}</span>`,
  })
  return mount(Test)
}

describe('useCountUp', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows the final value instantly when matchMedia is unavailable (jsdom/SSR)', () => {
    // jsdom has no window.matchMedia → treated as reduced motion → instant.
    expect(window.matchMedia).toBeUndefined()
    const wrapper = mountCountUp(42)
    expect(wrapper.text()).toBe('42')
  })

  it('shows the final value instantly under prefers-reduced-motion', () => {
    const wrapper = mountCountUp(123, { reducedMotion: true })
    expect(wrapper.text()).toBe('123')
  })

  it('never renders a transient zero before the real number is present', async () => {
    const wrapper = mountCountUp(7, { reducedMotion: true })
    await nextTick()
    expect(wrapper.text()).toBe('7')
  })

  describe('with animation enabled', () => {
    let rafQueue: FrameRequestCallback[]
    let nowValue: number

    beforeEach(() => {
      rafQueue = []
      nowValue = 0
      // The composable reads window.* — stub on window so frames are driven
      // synchronously by `advance()` rather than the real jsdom raf clock.
      vi.spyOn(window.performance, 'now').mockImplementation(() => nowValue)
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafQueue.push(cb)
        return rafQueue.length
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })

    async function advance(t: number): Promise<void> {
      nowValue = t
      const pending = rafQueue
      rafQueue = []
      for (const cb of pending) cb(t)
      await nextTick()
    }

    it('reaches exactly the final value at the end of the run', async () => {
      const wrapper = mountCountUp(100, { reducedMotion: false, durationMs: 1000 })
      await nextTick()

      // Mid-flight: started below the target.
      await advance(500)
      const mid = Number(wrapper.text())
      expect(mid).toBeGreaterThanOrEqual(0)
      expect(mid).toBeLessThan(100)

      // Past the duration: snaps to the exact target (no rounding drift).
      await advance(1000)
      expect(wrapper.text()).toBe('100')
    })

    it('restarts when the reactive source changes', async () => {
      const source = ref(10)
      const wrapper = mountCountUp(source, { reducedMotion: false, durationMs: 1000 })
      await nextTick()
      await advance(1000)
      expect(wrapper.text()).toBe('10')

      source.value = 25
      await nextTick()
      await advance(2000)
      await advance(3000)
      expect(wrapper.text()).toBe('25')
    })
  })
})
