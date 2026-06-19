import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useTabPill } from '../useTabPill'

describe('useTabPill', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('positions the pill against the active tab', async () => {
    const TestComponent = defineComponent({
      setup() {
        const containerRef = ref<HTMLElement | null>(null)
        const { pillStyle, updatePillPosition } = useTabPill({
          containerRef,
          activeSelector: '.tab--active',
        })
        return { containerRef, pillStyle, updatePillPosition }
      },
      template: `
        <div ref="containerRef">
          <button class="tab tab--active">Overview</button>
        </div>
      `,
    })

    const wrapper = mount(TestComponent)
    const activeTab = wrapper.find('.tab--active').element as HTMLElement
    Object.defineProperty(activeTab, 'offsetLeft', { configurable: true, value: 24 })
    Object.defineProperty(activeTab, 'offsetWidth', { configurable: true, value: 96 })

    wrapper.vm.updatePillPosition()
    await nextTick()

    expect(wrapper.vm.pillStyle).toEqual({ left: '24px', width: '96px', opacity: '1' })
    wrapper.unmount()
  })

  it('clears scheduled updates on unmount', async () => {
    const TestComponent = defineComponent({
      setup() {
        const containerRef = ref<HTMLElement | null>(null)
        const { schedulePillUpdate } = useTabPill({
          containerRef,
          activeSelector: '.tab--active',
        })
        return { containerRef, schedulePillUpdate }
      },
      template: `
        <div ref="containerRef">
          <button class="tab tab--active">Overview</button>
        </div>
      `,
    })

    const wrapper = mount(TestComponent)
    await nextTick()

    wrapper.vm.schedulePillUpdate(100)
    const querySelectorSpy = vi.spyOn(Element.prototype, 'querySelector')

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(100)

    expect(querySelectorSpy).not.toHaveBeenCalled()
  })

  it('keeps page tab selection free of production-only step-through animation', () => {
    const pageSources = [
      'src/features/audit/pages/AuditPage.vue',
      'src/features/clients/pages/ClientsPage.vue',
      'src/features/users/pages/UsersPage.vue',
    ].map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))

    for (const source of pageSources) {
      expect(source).not.toContain('isAnimating')
      expect(source).not.toContain('stepDelay')
      expect(source).not.toContain("import.meta.env.MODE === 'test'")
      expect(source).not.toContain('setTimeout(updatePillPosition')
    }
  })
})
