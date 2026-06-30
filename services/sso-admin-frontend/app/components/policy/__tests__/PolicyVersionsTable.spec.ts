import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PolicyVersionsTable from '../PolicyVersionsTable.vue'
import type { SecurityPolicy } from '@/types/policy.types'

const policies: readonly SecurityPolicy[] = [
  {
    id: 7,
    category: 'password',
    version: 3,
    status: 'active',
    payload: { min_length: 14 },
    effective_at: '2026-06-20T10:00:00Z',
    actor_subject_id: '01HZX9ADMINULID0000000000',
    reason: 'Tighten',
    created_at: '2026-06-20T10:00:00Z',
    updated_at: '2026-06-20T10:00:00Z',
  },
  {
    id: 6,
    category: 'password',
    version: 2,
    status: 'superseded',
    payload: { min_length: 12 },
    effective_at: '2026-05-01T10:00:00Z',
    actor_subject_id: '01HZX9ADMINULID1111111111',
    reason: 'Baseline',
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-01T10:00:00Z',
  },
]

const props = {
  policies,
  caption: 'Versions',
  versionLabel: 'Version',
  effectiveLabel: 'Effective',
  statusLabel: 'Status',
  actorLabel: 'Changed by',
  statusLabels: { active: 'Active', superseded: 'Superseded' },
}

describe('PolicyVersionsTable', () => {
  it('renders one selectable row per version with its mapped status label', () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    expect(wrapper.find('[data-testid="policy-version-select-7"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="policy-version-select-6"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Active')
    expect(wrapper.text()).toContain('Superseded')
  })

  it('emits select with the policy id when a version button is clicked', async () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    await wrapper.find('[data-testid="policy-version-select-7"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[7]])
  })

  it('renders the actor id (mono) for each row', () => {
    const wrapper = mount(PolicyVersionsTable, { props })
    expect(wrapper.text()).toContain('01HZX9ADMINULID0000000000')
  })
})
