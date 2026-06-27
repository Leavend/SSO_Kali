import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiFolio from '@/components/ui/UiFolio.vue'
import UiDataList from '@/components/ui/UiDataList.vue'

describe('FOLIO-GRID: UiFolio', () => {
  it('renders a zero-padded NN / MM record count in condensed sans', () => {
    const wrapper = mount(UiFolio, { props: { index: 2, total: 14, variant: 'count' } })
    expect(wrapper.get('.ui-folio').text()).toBe('02 / 14')
    expect(wrapper.get('.ui-folio').classes()).not.toContain('ui-folio--mono')
  })

  it('renders a raw ID in the mono variant', () => {
    const wrapper = mount(UiFolio, { props: { value: 'sess-abc', variant: 'id' } })
    expect(wrapper.get('.ui-folio').text()).toBe('sess-abc')
    expect(wrapper.get('.ui-folio').classes()).toContain('ui-folio--mono')
  })
})

describe('FOLIO-GRID: UiDataList', () => {
  const props = {
    caption: 'Audit events',
    total: 14,
    folioIndex: true,
    columns: [
      { key: 'event', label: 'Event' },
      { key: 'sid', label: 'Session', variant: 'id' as const },
    ],
    rows: [
      { id: 'r1', event: 'admin.login', sid: 'sess-abc' },
      { id: 'r2', event: 'admin.logout', sid: 'sess-def' },
    ],
    nextLabel: 'Next',
    previousLabel: 'Previous',
  }

  it('captions with a folio count and renders the modular hairline grid table', () => {
    const wrapper = mount(UiDataList, { props })
    expect(wrapper.get('table').classes()).toContain('ui-tbl')
    expect(wrapper.get('caption').text()).toContain('Audit events')
    expect(wrapper.get('caption').text()).toContain('02 / 14')
  })

  it('sets folio row numerals and mono ID cells (compositional numerals)', () => {
    const wrapper = mount(UiDataList, { props })
    const folioCells = wrapper.findAll('.ui-tbl__folio-cell')
    expect(folioCells.map((c) => c.text())).toEqual(['01', '02'])
    expect(wrapper.get('.ui-folio--mono').text()).toBe('sess-abc')
  })

  it('exposes keyboard-focusable pagination that emits next/previous', async () => {
    const wrapper = mount(UiDataList, { props })
    const next = wrapper.get('[data-testid="data-list-next"]')
    const previous = wrapper.get('[data-testid="data-list-previous"]')
    expect(next.element.tagName).toBe('BUTTON')
    await next.trigger('click')
    await previous.trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })
})
