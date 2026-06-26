import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { resolveStatusTone } from './status-tone'
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'

describe('resolveStatusTone', () => {
  it('passes canonical tones through unchanged', () => {
    expect(resolveStatusTone('success')).toBe('success')
    expect(resolveStatusTone('warning')).toBe('warning')
    expect(resolveStatusTone('danger')).toBe('danger')
    expect(resolveStatusTone('info')).toBe('info')
    expect(resolveStatusTone('brand')).toBe('brand')
    expect(resolveStatusTone('neutral')).toBe('neutral')
  })

  it('maps domain status aliases to their tone', () => {
    // active → success (the documented alias)
    expect(resolveStatusTone('active')).toBe('success')
    expect(resolveStatusTone('locked')).toBe('danger')
    expect(resolveStatusTone('pending')).toBe('warning')
    expect(resolveStatusTone('staged')).toBe('warning')
    expect(resolveStatusTone('succeeded')).toBe('success')
    expect(resolveStatusTone('failed')).toBe('danger')
    expect(resolveStatusTone('disabled')).toBe('neutral')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(resolveStatusTone('  ACTIVE ')).toBe('success')
    expect(resolveStatusTone('Locked')).toBe('danger')
  })

  it('falls back to neutral for unknown or empty values', () => {
    expect(resolveStatusTone('totally-unknown')).toBe('neutral')
    expect(resolveStatusTone('')).toBe('neutral')
    expect(resolveStatusTone(null)).toBe('neutral')
    expect(resolveStatusTone(undefined)).toBe('neutral')
  })
})

describe('UiStatusBadge', () => {
  it('renders the resolved data-tone for a status alias plus a non-color dot cue', () => {
    const wrapper = mount(UiStatusBadge, { props: { status: 'active' } })
    const badge = wrapper.get('.status')
    expect(badge.attributes('data-tone')).toBe('success')
    // Colour is never the sole cue: a dot + the readable label are present.
    expect(wrapper.find('.status__dot').exists()).toBe(true)
    expect(wrapper.find('.status__label').text()).toBe('active')
  })

  it('honours an explicit tone override and a custom label', () => {
    const wrapper = mount(UiStatusBadge, {
      props: { status: 'active', tone: 'brand', label: 'Aktif' },
    })
    const badge = wrapper.get('.status')
    expect(badge.attributes('data-tone')).toBe('brand')
    expect(wrapper.get('.status__label').text()).toBe('Aktif')
  })

  it('falls back to neutral and an em dash when no status is provided', () => {
    const wrapper = mount(UiStatusBadge, { props: {} })
    expect(wrapper.get('.status').attributes('data-tone')).toBe('neutral')
    expect(wrapper.get('.status__label').text()).toBe('—')
  })
})
