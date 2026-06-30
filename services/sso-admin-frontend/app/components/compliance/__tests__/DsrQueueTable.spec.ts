import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DsrQueueTable from '../DsrQueueTable.vue'
import type { DataSubjectRequest } from '@/types/compliance.types'

vi.mock('@/composables/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const submitted: DataSubjectRequest = {
  request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9V',
  subject_id: 'sub_0a1b2c3d4e5f6a7b8c9d',
  type: 'export',
  status: 'submitted',
  submitted_at: '2026-06-20T09:00:00Z',
  reviewed_at: null,
  fulfilled_at: null,
  sla_due_at: '2026-06-27T09:00:00Z',
}
const approved: DataSubjectRequest = {
  ...submitted,
  request_id: '01J9XQ7K8M4N2P3Q5R6S7T8U9W',
  status: 'approved',
}

function mountTable(rows: readonly DataSubjectRequest[], canReview: boolean) {
  return mount(DsrQueueTable, { props: { caption: 'DSR queue', rows, canReview } })
}

describe('DsrQueueTable — PII minimization', () => {
  it('masks subject_id and request_id and never renders reason/reviewer fields', () => {
    // The narrowed DTO has no reason/notes, but a raw backend row (pre-strip) could;
    // the table must never project them. Cast the stray free-text in to prove it.
    const leaky = {
      ...submitted,
      reason: 'deeply private subject reason text',
      reviewer_subject_id: 'sub_reviewer_secret_99',
      reviewer_notes: 'internal reviewer note never shown',
    } as unknown as DataSubjectRequest
    const text = mountTable([leaky], true).text()
    expect(text).not.toContain('sub_0a1b2c3d4e5f6a7b8c9d')
    expect(text).not.toContain('01J9XQ7K8M4N2P3Q5R6S7T8U9V')
    expect(text).not.toContain('deeply private subject reason text')
    expect(text).not.toContain('sub_reviewer_secret_99')
    expect(text).not.toContain('internal reviewer note never shown')
    expect(text).toContain('REF-')
  })
  it('renders the status as a labelled badge (never colour-alone)', () => {
    const html = mountTable([submitted], true).html()
    expect(html).toContain('submitted')
  })
})

describe('DsrQueueTable — actions gating + emits', () => {
  it('hides the action buttons entirely when canReview is false', () => {
    const w = mountTable([submitted], false)
    expect(w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9V"]').exists()).toBe(false)
  })
  it('emits review with the full request and enables it only when submitted', async () => {
    const w = mountTable([submitted], true)
    const btn = w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9V"]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.emitted('review')?.[0]).toEqual([submitted])
  })
  it('disables review on a non-submitted row and enables fulfill only when approved', async () => {
    const w = mountTable([approved], true)
    expect(
      w.find('[data-action="review-01J9XQ7K8M4N2P3Q5R6S7T8U9W"]').attributes('disabled'),
    ).toBeDefined()
    const fulfill = w.find('[data-action="fulfill-01J9XQ7K8M4N2P3Q5R6S7T8U9W"]')
    expect(fulfill.attributes('disabled')).toBeUndefined()
    await fulfill.trigger('click')
    expect(w.emitted('fulfill')?.[0]).toEqual([approved])
  })
})
